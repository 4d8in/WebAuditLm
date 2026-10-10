// Authorization gate for active scan modules.
//
// Rule: ANY module that sends something other than a plain GET a normal
// visitor's browser would send — injected payloads (XSS probes), probing
// for files that shouldn't be public (.env, .git/HEAD), subdomain
// enumeration, HTTP method/CORS fuzzing — may only run once the requesting
// user has proven ownership of the target domain. Passive analysis (reading
// headers/HTML/timings of the page you were asked to scan) is not gated.
//
// Call `assertAuthorizedForActiveModules` once per scan, before
// `runExtremeModules`, and use its result to force every active module's
// `scanOptions` flag to `false` when the target isn't verified.

export interface AuthorizationResult {
  verified: boolean;
  domain: string;
  reason: string;
}

function normalizeDomain(rawUrl: string): string {
  const host = new URL(rawUrl).hostname.toLowerCase();
  return host.startsWith('www.') ? host.slice(4) : host;
}

export async function checkTargetAuthorization(
  supabase: any,
  userId: string,
  targetUrl: string,
): Promise<AuthorizationResult> {
  const domain = normalizeDomain(targetUrl);

  const { data, error } = await supabase
    .from('verified_targets')
    .select('status, verified_at')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('status', 'verified')
    .maybeSingle();

  if (error) {
    // Fail closed: a lookup error must never silently grant active-module access.
    return { verified: false, domain, reason: `verification lookup failed: ${error.message}` };
  }
  if (!data) {
    return { verified: false, domain, reason: 'no verified ownership record for this domain' };
  }
  return { verified: true, domain, reason: `verified at ${data.verified_at}` };
}

/**
 * Mutates scanOptions in place so every active-module flag is forced off
 * when ownership isn't proven, no matter what the caller originally passed.
 * This is the single choke point — a new active module added later only
 * needs to read its own flag from scanOptions and gets covered for free,
 * as long as it's listed in ACTIVE_MODULE_FLAGS below.
 */
const ACTIVE_MODULE_FLAGS = ['pentest', 'osint', 'secrets', 'recon'] as const;

export function lockActiveModules(
  scanOptions: Record<string, any>,
  auth: AuthorizationResult,
): { scanOptions: Record<string, any>; blocked: string[] } {
  if (auth.verified) return { scanOptions, blocked: [] };

  const blocked: string[] = [];
  for (const flag of ACTIVE_MODULE_FLAGS) {
    if (scanOptions[flag] !== false) blocked.push(flag);
    scanOptions[flag] = false;
  }
  return { scanOptions, blocked };
}
