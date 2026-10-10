import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getServiceSupabase } from './db/supabase.ts';
import { registerVerifyTargetRoute } from './routes/verify-target.ts';
import { runActiveScan } from './orchestrator/index.ts';
import { generateReport } from './agents/reporting/index.ts';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const supabase = getServiceSupabase();
registerVerifyTargetRoute(app, supabase);

// Minimal scan-trigger endpoint. Everything active goes through
// runActiveScan -> authorizeActiveModules, never direct module calls.
app.post('/api/scans', async (req, reply) => {
  const accountId = req.headers['x-account-id'];
  if (!accountId || typeof accountId !== 'string') {
    return reply.status(401).send({ error: 'Missing x-account-id' });
  }
  const body = (req.body ?? {}) as { targetUrl?: string; modules?: string[] };
  if (!body.targetUrl) {
    return reply.status(400).send({ error: 'targetUrl is required' });
  }

  const scanId = crypto.randomUUID();
  const outcome = await runActiveScan(supabase, {
    accountId,
    targetUrl: body.targetUrl,
    scanId,
    modules: body.modules,
  });

  const report = await generateReport(
    { targetUrl: outcome.targetUrl, domain: outcome.domain, isLab: outcome.isLab, scanId },
    outcome.results,
  );

  return reply.send({ scanId, outcome, report });
});

app.get('/api/health', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
