# WebAuditLm

Agentic AppSec toolkit. See `CLAUDE.md` (not committed — local spec file)
for the full constraint list; this README is the quick developer map.

## Layout

```
/backend
  /src
    /orchestrator      — gate.ts (authorizeActiveModules), the only chokepoint
                          active modules reach the network through; index.ts
                          dispatches via modules-registry.ts
    /modules
      /passive          — crawler, html-analyzer, security-headers, scoring,
                           authorization.ts — recycled from recycle/scan-engine,
                           not gated (equivalent to a normal browser GET)
      /active            — one folder per vuln class (12 total). Only `xss`
                           and `access-control` have real detection logic in
                           this pass; the rest are stubs via stub.ts that
                           refuse to touch the network when unauthorized.
    /agents/reporting   — turns ModuleResult[] into a markdown report,
                           optionally enriched by a local LLM
    /llm                — thin OpenAI-compatible chat-completions client
    /routes             — verify-target (domain ownership proof), scans
  /src/orchestrator/__tests__/gate.test.ts
                        — asserts every registered active module makes
                          ZERO network calls when authorization is
                          verified:false. This is the test that must fail
                          loudly if a future module forgets to check.
/frontend               — React + Vite + Tailwind. /settings/verification
                           is the first screen; nothing active works
                           without a verified target.
/supabase/migrations    — verified_targets (account-scoped, is_lab flag,
                           no second table, no signature bypass)
```

## Running locally

```
cd backend && npm install && cp .env.example .env   # fill in Supabase local creds
npx supabase start                                  # from repo root, once supabase/ has a config.toml
npm run dev                                          # backend, :8787
```

```
cd frontend && npm install && npm run dev            # :5173, proxies /api to :8787
```

## Status / open items

- **12 vuln-class modules**: `xss` and `access-control` are fully
  implemented (non-destructive probes only). The other 10 are typed stubs —
  fill in detection logic module by module, one PR per module.
- **CLAUDE.md §6 (billing signature)** is explicitly NOT implemented. Do not
  add a signature-based bypass of the ownership check — ownership and
  billing must stay two separate functions when that phase starts.
- **An ambiguous note at the end of CLAUDE.md** (referencing a
  "subspace-pass" / hidden admin-only label) was flagged back to Edwin and
  intentionally NOT implemented pending clarification — it read as a
  possible authorization-bypass mechanism, which would conflict with the
  fail-closed gate this whole pass is built around.
