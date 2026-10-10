// Domain verification settings page — CLAUDE.md §2.2 / BUILD_PROMPT.md
// Step 5: this is the one screen that must exist before anything else,
// since no active module runs against an unverified target.
import { useState } from 'react';
import { startVerification, checkVerification, type VerifyTargetStartResponse } from '../lib/api.ts';

type Status = 'idle' | 'pending' | 'verified' | 'failed';

export default function VerificationPage() {
  const [domain, setDomain] = useState('');
  const [isLab, setIsLab] = useState(false);
  const [pending, setPending] = useState<VerifyTargetStartResponse | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await startVerification(domain, isLab);
      setPending(res);
      setStatus(res.verified ? 'verified' : 'pending');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheck(method: 'dns_txt' | 'file_upload') {
    if (!pending) return;
    setError(null);
    setLoading(true);
    try {
      const res = await checkVerification(pending.domain, method);
      setStatus(res.verified ? 'verified' : 'failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Domain Verification</h2>
        <p className="mt-1 text-sm text-slate-400">
          Prove ownership of a domain before any active module (XSS probes, access-control checks, and the rest
          of the 12-category suite) can run against it. Passive checks (headers, performance, SEO, accessibility)
          don't need this.
        </p>
      </div>

      <form onSubmit={handleStart} className="space-y-3 rounded-lg border border-slate-800 p-4">
        <label className="block text-sm">
          Domain
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isLab} onChange={(e) => setIsLab(e.target.checked)} />
          This is a self-hosted lab target (Juice Shop, DVWA, WebGoat, etc.)
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          Start verification
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {pending && (
        <div className="space-y-4 rounded-lg border border-slate-800 p-4">
          <StatusBadge status={status} />
          {status === 'verified' && pending.isLab && (
            <p className="text-sm text-slate-300">
              Lab target <code className="text-xs">{pending.domain}</code> is verified. Active modules can run
              through the gate without DNS TXT or a verification file.
            </p>
          )}
          {status !== 'verified' && pending.instructions && (
          <>
          <div>
            <h3 className="text-sm font-medium">Option A — DNS TXT record</h3>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs">{pending.instructions.dns_txt}</pre>
            <button
              onClick={() => handleCheck('dns_txt')}
              disabled={loading}
              className="mt-2 rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
            >
              Check DNS TXT
            </button>
          </div>
          <div>
            <h3 className="text-sm font-medium">Option B — File upload</h3>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs">{pending.instructions.file_upload}</pre>
            <button
              onClick={() => handleCheck('file_upload')}
              disabled={loading}
              className="mt-2 rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
            >
              Check file upload
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    idle: 'bg-slate-800 text-slate-300',
    pending: 'bg-amber-900/50 text-amber-300',
    verified: 'bg-emerald-900/50 text-emerald-300',
    failed: 'bg-red-900/50 text-red-300',
  };
  return <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${styles[status]}`}>{status}</span>;
}
