// Reporting agent (CLAUDE.md §3 / BUILD_PROMPT.md Step 4).
//
// Takes the aggregated ModuleResult[] from a completed scan and produces a
// structured, severity-sorted markdown report with remediation. This is the
// one piece allowed to call an LLM — wired to a local, OpenAI-compatible
// endpoint via REPORTING_LLM_ENDPOINT, so it works with whatever's running
// locally (Ollama, vLLM, ...) without hardcoding a model.
//
// Deliberately decoupled from the orchestrator: this module never decides
// what ran or whether a target was authorized — it only renders findings
// it's handed. CLAUDE.md §2.6: output is a findings report with
// severity/remediation, not a ready-to-fire exploit chain, so this agent
// only ever summarizes/explains findings already produced by gated modules
// — it never crafts new payloads or probes anything itself.
import type { ModuleResult, Finding, Severity } from '../../modules/active/types.ts';
import { chatCompletion, type ChatMessage } from '../../llm/client.ts';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface ReportingContext {
  targetUrl: string;
  domain: string;
  isLab: boolean;
  scanId: string;
}

export interface GenerateReportOptions {
  llmEndpoint?: string;   // defaults to process.env.REPORTING_LLM_ENDPOINT
  llmModel?: string;      // defaults to process.env.REPORTING_LLM_MODEL
  /** Skip the LLM call entirely and emit the deterministic markdown only.
   *  Useful for tests and for when no local LLM endpoint is configured. */
  skipLlm?: boolean;
}

function flattenFindings(results: ModuleResult[]): Array<Finding & { module: string }> {
  const out: Array<Finding & { module: string }> = [];
  for (const r of results) {
    for (const f of r.findings) out.push({ ...f, module: r.module });
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Deterministic markdown — always produced, with or without an LLM. */
export function renderDeterministicReport(ctx: ReportingContext, results: ModuleResult[]): string {
  const findings = flattenFindings(results);
  const ranModules = results.filter((r) => r.ran).map((r) => r.module);
  const skipped = results.filter((r) => !r.ran);

  const lines: string[] = [];
  lines.push(`# Security Assessment Report — ${ctx.domain}`);
  lines.push('');
  lines.push(`**Target:** ${ctx.targetUrl}  `);
  lines.push(`**Mode:** ${ctx.isLab ? 'Lab (self-hosted intentionally-vulnerable target)' : 'Client (verified ownership)'}  `);
  lines.push(`**Scan ID:** ${ctx.scanId}  `);
  lines.push(`**Modules run:** ${ranModules.join(', ') || 'none'}`);
  if (skipped.length > 0) {
    lines.push(`**Modules skipped (unauthorized):** ${skipped.map((s) => `${s.module} (${s.skippedReason})`).join(', ')}`);
  }
  lines.push('');

  if (findings.length === 0) {
    lines.push('No findings were reported by the modules that ran.');
    return lines.join('\n');
  }

  lines.push('## Findings (sorted by severity)');
  lines.push('');
  for (const f of findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push('');
    lines.push(`- **Module:** ${f.module}`);
    lines.push(`- **Affected endpoint:** ${f.affectedEndpoint}`);
    lines.push(`- **Description:** ${f.description}`);
    lines.push(`- **Evidence:** ${f.evidence}`);
    lines.push(`- **Remediation:** ${f.remediation}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Produces the final report. By default tries to use a local LLM (via
 * REPORTING_LLM_ENDPOINT) to turn the deterministic markdown into a more
 * readable narrative summary, prepended to the same structured findings —
 * but it degrades gracefully to the deterministic report alone if no LLM
 * endpoint is configured or the call fails.
 */
export async function generateReport(
  ctx: ReportingContext,
  results: ModuleResult[],
  opts: GenerateReportOptions = {},
): Promise<string> {
  const deterministic = renderDeterministicReport(ctx, results);

  const endpoint = opts.skipLlm ? undefined : (opts.llmEndpoint ?? process.env.REPORTING_LLM_ENDPOINT);
  if (!endpoint) return deterministic;

  const model = opts.llmModel ?? process.env.REPORTING_LLM_MODEL ?? 'local-model';
  const findings = flattenFindings(results);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a security report writer. You summarize findings a scanner already produced — you never invent new vulnerabilities, never suggest exploit payloads, and never claim a finding exists if it is not in the provided list. Write a short executive summary (3-6 sentences) in markdown for a technical but time-constrained reader, oriented around risk and remediation priority.',
    },
    {
      role: 'user',
      content: `Target: ${ctx.domain} (${ctx.isLab ? 'lab' : 'client'} mode)\nFindings JSON:\n${JSON.stringify(findings, null, 2)}`,
    },
  ];

  try {
    const { content } = await chatCompletion({ endpoint, model, messages });
    if (!content.trim()) return deterministic;
    return `${content.trim()}\n\n---\n\n${deterministic}`;
  } catch {
    // LLM enrichment is an augmentation layer, not a hard dependency —
    // same posture as pagespeed.ts/browser-service.ts in the passive layer.
    return deterministic;
  }
}
