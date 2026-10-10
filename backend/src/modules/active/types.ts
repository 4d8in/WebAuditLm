// Shared types for every active-module (gated) scan category.
// Pure type declarations — no runtime code, no network access.
import type { ModuleContext } from '../../orchestrator/gate.ts';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  severity: Severity;
  title: string;
  description: string;
  evidence: string;
  affectedEndpoint: string;
  remediation: string;
}

export interface ModuleResult {
  module: string;
  findings: Finding[];
  /** True when the module actually ran probes; false when it short-circuited
   *  (e.g. because authorization wasn't verified). Lets callers/tests tell
   *  "ran and found nothing" apart from "didn't run". */
  ran: boolean;
  skippedReason?: string;
}

export function emptyResult(module: string, skippedReason?: string): ModuleResult {
  return { module, findings: [], ran: false, skippedReason };
}

/**
 * Every active module's `run` has this shape. `ctx.auth` is the frozen,
 * already-checked AuthorizationResult from the gate — the module's own job
 * is simply to refuse to touch the network when `ctx.auth.verified` isn't
 * `true`. See orchestrator/gate.ts and its test for the enforced contract.
 */
export type ActiveModule = (ctx: ModuleContext) => Promise<ModuleResult>;
