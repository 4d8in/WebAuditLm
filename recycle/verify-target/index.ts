// Domain ownership verification.
//
// Flow:
//   1. POST { domain } with no method yet -> creates a 'pending' row with a
//      fresh token, returns the DNS TXT value and the file-upload path/content
//      the user needs to publish.
//   2. POST { domain, method: 'dns_txt' | 'file_upload' } -> actually checks
//      for the token via DNS-over-HTTPS or an HTTP GET, and flips the row to
//      'verified' or 'failed'.
//
// This never runs on behalf of a scan — it's a deliberate, user-initiated
// action the account owner takes once per domain before active modules can
// touch it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeDomain(input: string): string {
  const host = input.includes('://') ? new URL(input).hostname : input;
  const lower = host.toLowerCase().trim();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

async function checkDnsTxt(domain: string, token: string): Promise<boolean> {
  const r = await fetch(
    `https://cloudflare-dns.com/dns-query?name=webaudit-verify.${domain}&type=TXT`,
    { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
  );
  if (!r.ok) return false;
  const data = await r.json().catch(() => ({}));
  const answers: string[] = (data?.Answer || []).map((a: any) => String(a.data || '').replace(/^"|"$/g, ''));
  return answers.some((v) => v === token);
}

async function checkFileUpload(domain: string, token: string): Promise<boolean> {
  const r = await fetch(`https://${domain}/.well-known/webaudit-verification.txt`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return false;
  const body = (await r.text()).trim();
  return body === token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const domain = normalizeDomain(String(body.domain || ''));
    if (!domain || !domain.includes('.')) {
      return new Response(JSON.stringify({ error: 'Invalid domain' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: no method yet -> issue (or return existing) pending token.
    if (!body.method) {
      const { data: existing } = await supabase
        .from('verified_targets')
        .select('*')
        .eq('user_id', userId)
        .eq('domain', domain)
        .maybeSingle();

      const row = existing ?? (await supabase
        .from('verified_targets')
        .insert({ user_id: userId, domain, method: 'dns_txt', status: 'pending' })
        .select()
        .single()).data;

      return new Response(JSON.stringify({
        domain,
        token: row.token,
        instructions: {
          dns_txt: `Create a TXT record at webaudit-verify.${domain} with value: ${row.token}`,
          file_upload: `Publish this exact content at https://${domain}/.well-known/webaudit-verification.txt :\n${row.token}`,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 2: actually verify.
    const method = body.method === 'file_upload' ? 'file_upload' : 'dns_txt';
    const { data: row, error: rowErr } = await supabase
      .from('verified_targets')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: 'No pending verification for this domain. Call without `method` first.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify({ domain, status: updated.status, verified: ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
