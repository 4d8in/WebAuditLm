// Thin fetch wrapper. accountId is hardcoded for the local-only dev pass
// (CLAUDE.md §4) — real session auth is a separate concern from this UI.
const ACCOUNT_ID = import.meta.env.VITE_DEV_ACCOUNT_ID ?? 'local-dev-account';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-account-id': ACCOUNT_ID,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface VerifyTargetStartResponse {
  domain: string;
  token: string;
  isLab: boolean;
  verified?: boolean;
  status?: 'pending' | 'verified' | 'failed' | 'revoked';
  instructions?: { dns_txt: string; file_upload: string };
}

export interface VerifyTargetCheckResponse {
  domain: string;
  status: 'pending' | 'verified' | 'failed' | 'revoked';
  verified: boolean;
}

export function startVerification(domain: string, isLab = false) {
  return request<VerifyTargetStartResponse>('/verify-target', {
    method: 'POST',
    body: JSON.stringify({ domain, isLab }),
  });
}

export function checkVerification(domain: string, method: 'dns_txt' | 'file_upload') {
  return request<VerifyTargetCheckResponse>('/verify-target', {
    method: 'POST',
    body: JSON.stringify({ domain, method }),
  });
}
