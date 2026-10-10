// Orchestrator: receives a scan request, resolves authorization through the
// gate ONCE, builds a frozen ModuleContext from that single result, and
// dispatches every requested active module through the registry. No active
// module is ever called with anything other than the context this function
// builds — that's what makes the gate an architectural chokepoint instead
// of a convention modules are expected to remember.
import { authorizeActiveModules, buildModuleContext, type SupabaseLike } from './gate.ts';
import { ACTIVE_MODULES } from './modules-registry.ts';
import type { ModuleResult } from '../modules/active/types.ts';

export interface ScanRequest {
  accountId: string;
  targetUrl: string;
  scanId: string;
  /** Which active categories to run; defaults to all registered ones. */
  modules?: string[];
}

export interface ScanOutcome {
  targetUrl: string;
  authorized: boolean;
  domain: string;
  isLab: boolean;
  results: ModuleResult[];
}

export async function runActiveScan(
  supabase: SupabaseLike,
  req: ScanRequest,
): Promise<ScanOutcome> {
  const auth = await authorizeActiveModules(supabase, req.accountId, req.targetUrl);
  const ctx = buildModuleContext(auth, req.targetUrl, req.accountId, req.scanId);

  const names = req.modules ?? Object.keys(ACTIVE_MODULES);
  const results: ModuleResult[] = [];
  for (const name of names) {
    const mod = ACTIVE_MODULES[name];
    if (!mod) continue;
    results.push(await mod(ctx));
  }

  return {
    targetUrl: req.targetUrl,
    authorized: auth.verified,
    domain: auth.domain,
    isLab: auth.verified ? auth.isLab : false,
    results,
  };
}
