// Manual smoke test for the reporting agent's LLM wiring — no Supabase, no
// real scan needed. Run with:
//   cd backend && npx tsx scripts/test-llm.ts            # uses LLM_PROFILE from .env (default: prod)
//   cd backend && LLM_PROFILE=dev npx tsx scripts/test-llm.ts   # fast model for quick iteration
// See backend/src/llm/profiles.ts for what each profile resolves to.
import 'dotenv/config';
import { generateReport } from '../src/agents/reporting/index.ts';
import type { ModuleResult } from '../src/modules/active/types.ts';

const fakeResults: ModuleResult[] = [
  {
    module: 'xss',
    ran: true,
    findings: [{
      severity: 'critical',
      title: 'Reflected XSS in `q` parameter (test data, not a real finding)',
      description: 'A harmless marker injected into the `q` query parameter was reflected unescaped, with no CSP present.',
      evidence: 'This is fabricated test data for a local LLM smoke test.',
      affectedEndpoint: 'https://example.com/?q=...',
      remediation: 'Escape all URL parameters before rendering; deploy a strict CSP.',
    }],
  },
  {
    module: 'access-control',
    ran: true,
    findings: [{
      severity: 'high',
      title: '/.env reachable without authentication (test data)',
      description: 'Fabricated test data for a local LLM smoke test.',
      evidence: 'n/a',
      affectedEndpoint: 'https://example.com/.env',
      remediation: 'Block well-known sensitive files at the reverse proxy.',
    }],
  },
];

const report = await generateReport(
  { targetUrl: 'https://example.com', domain: 'example.com', isLab: true, scanId: 'test-scan-1' },
  fakeResults,
);

console.log('--- REPORT OUTPUT ---\n');
console.log(report);
