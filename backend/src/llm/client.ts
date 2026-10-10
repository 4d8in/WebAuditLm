// Thin client for a local, OpenAI-compatible chat-completions endpoint
// (Ollama, vLLM, LM Studio, etc). Deliberately does not hardcode a model —
// callers pass whatever model name their local endpoint serves.
//
// This is a plain HTTP client with no knowledge of scanning, gating, or
// reporting — the reporting agent (backend/src/agents/reporting) is the
// only caller that gives it domain-specific prompts.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  endpoint: string;       // e.g. http://localhost:11434/v1 (Ollama) or http://localhost:8000/v1 (vLLM)
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  content: string;
  raw: unknown;
}

export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const url = `${opts.endpoint.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM endpoint ${url} returned ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content ?? '';
    return { content, raw: data };
  } finally {
    clearTimeout(timer);
  }
}
