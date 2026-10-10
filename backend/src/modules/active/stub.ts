// Factory for the 10 categories that are architecture-only in this pass
// (CLAUDE.md §4 / BUILD_PROMPT.md Step 3): full detection logic is
// deliberately out of scope — get the gate right first, fill in detection
// module-by-module afterward, each PR reviewed on its own.
//
// The one thing every stub MUST do, now and after detection logic lands,
// is refuse to touch the network when authorization isn't verified. That's
// enforced here once so no individual module can forget it.
import type { ModuleContext } from '../../orchestrator/gate.ts';
import type { ActiveModule, ModuleResult } from './types.ts';
import { emptyResult } from './types.ts';

export function makeStubModule(name: string): ActiveModule {
  return async function run(ctx: ModuleContext): Promise<ModuleResult> {
    if (!ctx.auth.verified) {
      return emptyResult(name, `blocked: target not authorized (${ctx.auth.reason})`);
    }
    // No detection logic yet — intentionally returns with no network calls.
    return { module: name, findings: [], ran: true };
  };
}
