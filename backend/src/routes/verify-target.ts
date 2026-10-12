// Domain ownership verification route.
//
// Adapted from recycle/verify-target/index.ts: same flow, same DNS TXT /
// file-upload challenge-response logic, unchanged — only the transport
// (Deno.serve → Fastify route handler) and the Supabase client wiring
// changed (service client is injected, not created via Deno.env inline).
//
//   0. POST { domain, isLab: true } -> if the host is a lab hostname
//      (localhost / *.local / private IP), write status=verified immediately
//      with is_lab=true. No DNS TXT or file check. The gate still requires
//      this row. Public domains cannot use this path.
//   1. POST { domain } with no method yet -> creates/returns a 'pending' row
//      with a token, plus the DNS TXT value and file-upload instructions.
//   2. POST { domain, method: 'dns_txt' | 'file_upload' } -> actually checks
//      the token and flips the row to 'verified' or 'failed'.
//
// This never runs on behalf of a scan — it is the deliberate, user-initiated
// action the account owner takes once per domain before any active module
// can touch it (CLAUDE.md §2.2).
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';

function normalizeDomain(input: string): string {
  const host = input.includes('://') ? new URL(input).hostname : input;
  const lower = host.toLowerCase().trim();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

/** Lab targets Edwin (or the team) hosts themselves — not a public client domain. */
function isLabHostname(domain: string): boolean {
  if (domain === 'localhost' || domain === '127.0.0.1' || domain === '[::1]' || domain === '::1') {
    return true;
  }
  if (domain.endsWith('.localhost') || domain.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(domain)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(domain)) return true;
  return false;
}

function isValidTargetHost(domain: string): boolean {
  if (!domain) return false;
  if (isLabHostname(domain)) return true;
  return domain.includes('.');
}

async function checkDnsTxt(domain: string, token: string): Promise<boolean> {
  const r = await fetch(
    `https://cloudflare-dns.com/dns-query?name=webaudit-verify.${domain}&type=TXT`,
    { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
  );
 //possibility of returning false if the file is not found
 // if (!r.ok) return false;
  const data = (await r.json().catch(() => ({}))) as any;
  const answers: string[] = (data?.Answer || []).map((a: any) => String(a.data || '').replace(/^"|"$/g, ''));
  //my own modifciation 
 // if(answers.length === 0) return false;
  return answers.some((v) => v === token);
}

async function checkFileUpload(domain: string, token: string): Promise<boolean> {
  const r = await fetch(`https://${domain}/.well-known/webaudit-verification.txt`, {
    signal: AbortSignal.timeout(8000),
  });
  //my own modifciation  with add r.status !== 404 to check if the file is not found or if the file is found but the content is not the same as the token
  //if (!r.ok || r.status === 404) return false;
  const body = (await r.text()).trim();
  return body === token;
}

export async function verifyTargetHandler(
  supabase: SupabaseClient,
  accountId: string,
  body: { domain?: string; method?: string; isLab?: boolean },
) {
  const domain = normalizeDomain(String(body.domain || ''));
  if (!isValidTargetHost(domain)) {
    return { status: 400 as const, payload: { error: 'Invalid domain' } };
  }

  // Lab: skip DNS TXT / file upload. Still writes a verified_targets row so
  // the orchestrator gate (authorizeActiveModules) stays the only chokepoint.
  // Public / client domains cannot take this path even if isLab is set.
  if (body.isLab) {
    if (!isLabHostname(domain)) {
      return {
        status: 400 as const,
        payload: {
          error:
            'Lab auto-verify is only for localhost, *.local, *.localhost, or a private IP. Client domains still need DNS TXT or file upload.',
        },
      };
    }

    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from('verified_targets')
      .select('*')
      .eq('account_id', accountId)
      .eq('domain', domain)
      .maybeSingle();

    const row = existing
      ? (await supabase
          .from('verified_targets')
          .update({
            is_lab: true,
            status: 'verified',
            verified_at: existing.verified_at ?? now,
            last_checked_at: now,
          })
          .eq('id', existing.id)
          .select()
          .single()).data
      : (await supabase
          .from('verified_targets')
          .insert({
            account_id: accountId,
            domain,
            method: 'dns_txt',
            status: 'verified',
            is_lab: true,
            verified_at: now,
            last_checked_at: now,
          })
          .select()
          .single()).data;

    return {
      status: 200 as const,
      payload: {
        domain,
        token: row.token,
        isLab: true,
        verified: true,
        status: 'verified' as const,
      },
    };
  }

  // Step 1: no method yet -> issue (or return existing) pending token.
  if (!body.method) {
    const { data: existing } = await supabase
      .from('verified_targets')
      .select('*')
      .eq('account_id', accountId)
      .eq('domain', domain)
      .maybeSingle();

    const row = existing ?? (await supabase
      .from('verified_targets')
      .insert({ account_id: accountId, domain, method: 'dns_txt', status: 'pending', is_lab: Boolean(body.isLab) })
      .select()
      .single()).data;

    return {
      status: 200 as const,
      payload: {
        domain,
        token: row.token,
        isLab: Boolean(row.is_lab),
        instructions: {
          dns_txt: `Create a TXT record at webaudit-verify.${domain} with value: ${row.token}`,
          file_upload: `Publish this exact content at https://${domain}/.well-known/webaudit-verification.txt :\n${row.token}`,
        },
      },
    };
  }

  // Step 2: actually verify.
  const method = body.method === 'file_upload' ? 'file_upload' : 'dns_txt';
  const { data: row, error: rowErr } = await supabase
    .from('verified_targets')
    .select('*')
    .eq('account_id', accountId)
    .eq('domain', domain)
    .maybeSingle();

  if (rowErr || !row) {
    return {
      status: 404 as const,
      payload: { error: 'No pending verification for this domain. Call without `method` first.' },
    };
  }

  const ok = method === 'dns_txt'
    ? await checkDnsTxt(domain, row.token)
    : await checkFileUpload(domain, row.token);

  const { data: updated } = await supabase
    .from('verified_targets')
    .update({
      method,
      status: ok ? 'verified' : 'failed',
      verified_at: ok ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select()
    .single();

  return { status: 200 as const, payload: { domain, status: updated.status, verified: ok } };
}

export function registerVerifyTargetRoute(app: FastifyInstance, supabase: SupabaseClient) {
  app.post('/api/verify-target', async (req: FastifyRequest, reply: FastifyReply) => {
    // In this local-only pass, the account id comes from a header set by the
    // (not-yet-built) auth layer. Wiring real session auth is a separate
    // concern from this endpoint's verification logic — see CLAUDE.md §4
    // ("runtime: local-only for now").
    const accountId = req.headers['x-account-id'];
    if (!accountId || typeof accountId !== 'string') {
      return reply.status(401).send({ error: 'Missing x-account-id' });
    }
    const body = (req.body ?? {}) as { domain?: string; method?: string; isLab?: boolean };
    const result = await verifyTargetHandler(supabase, accountId, body);
    return reply.status(result.status).send(result.payload);
  });
}
