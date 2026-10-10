// The authorization gate — the single chokepoint every active module must
// pass through before it sends anything beyond a plain GET to a target.
//
// Architectural rule (CLAUDE.md §2.1/§2.2, non-negotiable):
//   - No active module calls a target directly. It is only ever invoked by
//     the orchestrator, and only after the orchestrator has called
//     `authorizeActiveModules` and the module has checked the typed result.
//   - The result is a discriminated union, not a boolean — a module cannot
//     accidentally treat "unauthorized" as truthy the way it could with a
//     stray `if (auth)` on a boolean.
//   - Lab mode and client mode share the same `verified_targets` table
//     (CLAUDE.md §5). A lab target is just a row with `is_lab: true`; there
//     is no separate bypass path and no second table.
//   - This file intentionally does NOT implement CLAUDE.md §6 (the future
//     billing/signature gate). That is a different, later check that must
//     stay a separate function — never merged into this one.
//
// Reuses the fail-closed lookup logic from recycle/scan-engine/authorization.ts
// verbatim (see ../modules/passive/scan-engine/authorization.ts) — this file
// is the new chokepoint wrapper around it, not a reimplementation.

import { checkTargetAuthorization } from '../modules/passive/scan-engine/authorization.ts';

export type AuthorizationResult =
  | { verified: true; domain: string; isLab: boolean; reason: string }
  | { verified: false; domain: string; isLab: false; reason: string };

export interface SupabaseLike {
  from(table: string): any;
}

/**
 * The only entry point active modules may rely on (indirectly — via the
 * orchestrator, never by calling this themselves). Fails closed on any
 * lookup error, missing row, or unverified status.
 *
 * `accountId` matches a team/account, not necessarily the individual user —
 * verified_targets is scoped per account per CLAUDE.md §5, so once any team
 * member verifies a domain (or adds a lab row), every teammate on the same
 * account is covered by this same check.
 */
export async function authorizeActiveModules(
  supabase: SupabaseLike,
  accountId: string,
  targetUrl: string,
): Promise<AuthorizationResult> {
  const legacy = await checkTargetAuthorization(supabase, accountId, targetUrl);

  if (!legacy.verified) {
    return { verified: false, domain: legacy.domain, isLab: false, reason: legacy.reason };
  }

  // Determine is_lab from the same row/table — never a second table, never
  // a signature check (that's §6, deliberately not implemented here).
  const { data, error } = await supabase
    .from('verified_targets')
    .select('is_lab')
    .eq('account_id', accountId)
    .eq('domain', legacy.domain)
    .eq('status', 'verified')
    .maybeSingle();

  if (error) {
    // Fail closed even on this secondary lookup.
    return { verified: false, domain: legacy.domain, isLab: false, reason: `is_lab lookup failed: ${error.message}` };
  }

  return {
    verified: true,
    domain: legacy.domain,
    isLab: Boolean(data?.is_lab),
    reason: legacy.reason,
  };
}

/**
 * Freezes an AuthorizationResult onto a module context so that an active
 * module physically cannot swap in its own object. Modules receive this,
 * never a raw boolean, and must branch on `.verified` before touching the
 * network.
 */
export interface ModuleContext {
  readonly auth: AuthorizationResult;
  readonly targetUrl: string;
  readonly accountId: string;
  readonly scanId: string;
}

export function buildModuleContext(
  auth: AuthorizationResult,
  targetUrl: string,
  accountId: string,
  scanId: string,
): ModuleContext {
  return Object.freeze({ auth: Object.freeze(auth), targetUrl, accountId, scanId });
}



