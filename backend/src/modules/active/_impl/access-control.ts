// Access-control module — the second of the two fully implemented active
// modules in this pass (BUILD_PROMPT.md Step 3). Reuses two pieces already
// in recycle/ rather than reimplementing them:
//   1. `analyzeHeadersPro` (recycle/scan-engine/features/security-headers.ts,
//      copied verbatim to ../../passive/scan-engine/features/security-headers.ts)
//      for the header checks that double as access-control signals
//      (clickjacking protection, CORS-adjacent headers, etc).
//   2. The non-destructive forced-browsing probe pattern from
//      recycle/scan-engine/extreme/index.ts's "Recon .well-known" block —
//      plain GETs against a short, fixed list of common admin/sensitive
//      paths, used here to flag paths that are reachable without
//      authentication (an access-control finding, not an info-disclosure
//      scraper — scope is deliberately narrow).
//
// This module IS gated: probing paths beyond the one URL the user submitted
// is exactly the kind of unsolicited active testing CLAUDE.md §2.1 requires
// proof of ownership for, even though reading headers of the single
// requested page would be passive on its own.
import type { ModuleContext } from '../../../orchestrator/gate.ts';
import type { Finding, ModuleResult } from '../types.ts';
import { emptyResult } from '../types.ts';
import { analyzeHeadersPro } from '../../passive/scan-engine/features/security-headers.ts';

const MODULE_NAME = 'access-control';

// Deliberately small and well-known — this is a forced-browsing check, not
// a wordlist-based directory brute force (that would be a separate,
// explicitly-confirmed "destructive/noisy" mode per CLAUDE.md §2.4, out of
// scope here).
const COMMON_SENSITIVE_PATHS = [
  '/admin',
  '/.env',
  '/.git/HEAD',
  '/wp-admin',
  '/.well-known/security.txt',
];

export async function run(ctx: ModuleContext): Promise<ModuleResult> {
  if (!ctx.auth.verified) {
    return emptyResult(MODULE_NAME, `blocked: target not authorized (${ctx.auth.reason})`);
  }

  const findings: Finding[] = [];

  // ---- 1. Header-based access-control / clickjacking signals ----
  try {
    const res = await fetch(ctx.targetUrl, { signal: AbortSignal.timeout(10000) });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

    const headerIssues = analyzeHeadersPro(headers).filter(
      (i) => i.title.includes('clickjacking') || i.title.includes('X-Frame-Options') || i.title.includes('CSP'),
    );
    for (const issue of headerIssues) {
      findings.push({
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        evidence: `Response headers for ${ctx.targetUrl}`,
        affectedEndpoint: ctx.targetUrl,
        remediation: issue.recommendation,
      });
    }
  } catch (e) {
    // Non-fatal — still run the forced-browsing probes below.
  }

  // ---- 2. Forced-browsing probe for common sensitive/privileged paths ----
  try {
    const base = new URL(ctx.targetUrl).origin;
    const exposed: string[] = [];
    for (const path of COMMON_SENSITIVE_PATHS) {
      try {
        const r = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(6000) });
        if (r.status === 200) exposed.push(path);
      } catch {
        // treat as not exposed
      }
    }
    if (exposed.length > 0) {
      findings.push({
        severity: 'high',
        title: `Sensitive path(s) reachable without authentication: ${exposed.join(', ')}`,
        description: 'One or more common admin/sensitive paths returned HTTP 200 without any authentication challenge.',
        evidence: `Probed paths: ${COMMON_SENSITIVE_PATHS.join(', ')}. Reachable: ${exposed.join(', ')}`,
        affectedEndpoint: base,
        remediation: 'Require authentication (and authorization) for every admin/internal path, and block well-known sensitive files (.env, .git) at the reverse proxy.',
      });
    }
  } catch {
    // leave findings as-is
  }

  return { module: MODULE_NAME, ran: true, findings };
}
