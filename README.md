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

## Database — hosted Supabase project (primary)

The backend talks to a real hosted Supabase project, not the local Docker
stack (that was only used to prove the migrations out during setup, then
stopped — see "Local/offline alternative" below).

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Run both files in `supabase/migrations/` against it, in order, via the
   dashboard's **SQL Editor** (paste file 1, run; paste file 2, run).
3. From **Settings → API**, copy the **Project URL** (`https://<ref>.supabase.co`
   — not the dashboard page URL in your browser's address bar, that's a
   different thing) and the **service_role** (secret) key into
   `backend/.env`:
   ```
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   ```

### Local/offline alternative

`supabase/config.toml` is only read when you run the CLI's local Docker
stack — it has no effect on the hosted path above. Useful if you want to
work without an account/internet:
```
npx supabase start   # from repo root; prints a local SUPABASE_URL/SERVICE_ROLE_KEY to use instead
npx supabase stop     # tears the containers back down
```

## Running locally

```
cd backend && npm install && cp .env.example .env   # fill in your Supabase project's URL/key
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
