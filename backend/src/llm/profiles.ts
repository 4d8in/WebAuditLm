// Picks which LLM config the reporting agent uses, via one switch
// (LLM_PROFILE) instead of hand-editing REPORTING_LLM_* every time you
// want to go from "fast iteration" to "the real model."
//
//   LLM_PROFILE=prod (default) -> REPORTING_LLM_ENDPOINT / REPORTING_LLM_MODEL
//   LLM_PROFILE=dev            -> DEV_LLM_ENDPOINT / DEV_LLM_MODEL
//
// Each profile also carries its own timeout, because a small dev model
// (seconds) and a large reasoning model on CPU-only hardware (minutes) need
// very different patience — one hardcoded timeout for both was the bug we
// actually hit testing this.
export type LlmProfile = 'dev' | 'prod';

export interface ResolvedLlmConfig {
  profile: LlmProfile;
  endpoint: string | undefined;
  model: string;
  timeoutMs: number;
}

const DEFAULT_PROD_TIMEOUT_MS = 180_000; // reasoning models on CPU can take minutes
const DEFAULT_DEV_TIMEOUT_MS = 30_000;   // dev profile is meant to be fast — fail fast too

export function resolveLlmProfile(env: NodeJS.ProcessEnv = process.env): ResolvedLlmConfig {
  const raw = (env.LLM_PROFILE ?? 'prod').trim().toLowerCase();
  if (raw !== 'dev' && raw !== 'prod') {
    console.warn(`[llm] LLM_PROFILE="${env.LLM_PROFILE}" is not "dev" or "prod" — defaulting to "prod".`);
  }
  const profile: LlmProfile = raw === 'dev' ? 'dev' : 'prod';

  if (profile === 'dev') {
    return {
      profile,
      // Dev profile falls back to the prod endpoint if it has its own
      // endpoint unset — same Ollama/vLLM server, just a lighter model —
      // but always needs its own model name to mean anything.
      endpoint: env.DEV_LLM_ENDPOINT ?? env.REPORTING_LLM_ENDPOINT,
      model: env.DEV_LLM_MODEL ?? 'qwen2.5:3b',
      timeoutMs: Number(env.DEV_LLM_TIMEOUT_MS ?? DEFAULT_DEV_TIMEOUT_MS),
    };
  }

  return {
    profile,
    endpoint: env.REPORTING_LLM_ENDPOINT,
    model: env.REPORTING_LLM_MODEL ?? 'local-model',
    timeoutMs: Number(env.REPORTING_LLM_TIMEOUT_MS ?? DEFAULT_PROD_TIMEOUT_MS),
  };
}
