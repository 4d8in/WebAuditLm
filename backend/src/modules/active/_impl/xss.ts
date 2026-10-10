// Reflected-XSS probe — one of the two fully implemented active modules in
// this pass (BUILD_PROMPT.md Step 3). Adapted from the working,
// non-destructive probe already in recycle/scan-engine/extreme/index.ts
// (the "XSS REFLECTED probe" block) — same payload, same non-mutating
// GET-only approach, just moved behind the gate and reshaped into the
// typed ModuleResult/Finding contract instead of pushing onto a shared
// mutable `issues` array.
//
// CLAUDE.md §2.1 / §2.2: this module NEVER calls the target directly on its
// own — it only runs because the orchestrator already called
// `authorizeActiveModules` and is handing it an already-checked
// AuthorizationResult via ModuleContext. The `ctx.auth.verified` check
// below is the module's own last-line defense, not the primary gate.
import type { ModuleContext } from '../../../orchestrator/gate.ts';
import type { ModuleResult } from '../types.ts';
import { emptyResult } from '../types.ts';

const MODULE_NAME = 'xss';

// Harmless proof-of-concept marker (CLAUDE.md §2.4: PoC only, no payload
// that mutates data or exfiltrates anything). Mirrors the original probe's
// `zXa1` marker pattern so a reflection is unambiguous and never fires in
// real traffic by accident.
const PROBE_MARKER = 'wa1XssProbe7f3';
const PROBE_PAYLOAD = `"><svg/onload=${PROBE_MARKER}>`;

export async function run(ctx: ModuleContext): Promise<ModuleResult> {
  if (!ctx.auth.verified) {
    return emptyResult(MODULE_NAME, `blocked: target not authorized (${ctx.auth.reason})`);
  }

  const probeUrl = `${ctx.targetUrl}${ctx.targetUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(PROBE_PAYLOAD)}`;

  try {
    const res = await fetch(probeUrl, { signal: AbortSignal.timeout(8000) });
    const body = await res.text();
    const reflected = body.includes(PROBE_PAYLOAD);
    const hasCsp = Boolean(res.headers.get('content-security-policy'));

    if (reflected && !hasCsp) {
      return {
        module: MODULE_NAME,
        ran: true,
        findings: [{
          severity: 'critical',
          title: 'Possible reflected XSS (query parameter `q`)',
          description: 'A harmless proof-of-concept marker injected into the `q` query parameter was reflected unescaped in the response body, with no Content-Security-Policy present to mitigate it.',
          evidence: `Requested: ${probeUrl}\nMarker "${PROBE_PAYLOAD}" found verbatim in response body. CSP header: absent.`,
          affectedEndpoint: probeUrl,
          remediation: 'Context-aware escape all URL parameters before rendering them into HTML, and deploy a strict Content-Security-Policy (script-src without \'unsafe-inline\') as defense in depth.',
        }],
      };
    }

    return { module: MODULE_NAME, ran: true, findings: [] };
  } catch (e) {
    return { module: MODULE_NAME, ran: true, findings: [], skippedReason: `probe request failed: ${(e as Error).message}` };
  }
}
