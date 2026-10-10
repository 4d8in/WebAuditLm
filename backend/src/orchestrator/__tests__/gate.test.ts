// This test must fail loudly if a future active module forgets to check
// `ctx.auth.verified` before touching the network. It asserts the actual
// invariant CLAUDE.md §2.1 requires: given an unverified (or absent-ownership)
// AuthorizationResult, NOT ONE active module may make any network call to
// the target.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authorizeActiveModules, buildModuleContext } from '../gate.ts';
import { ACTIVE_MODULES } from '../modules-registry.ts';

function fakeSupabaseAlwaysUnverified() {
  return {
    from(_table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
  };
}

describe('authorizeActiveModules — fail-closed gate', () => {
  it('returns verified:false when there is no verification record', async () => {
    const supabase = fakeSupabaseAlwaysUnverified();
    const result = await authorizeActiveModules(supabase, 'acct-1', 'https://example.com/');
    expect(result.verified).toBe(false);
  });

  it('fails closed on a lookup error', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: { message: 'db down' } }),
        };
      },
    };
    const result = await authorizeActiveModules(supabase, 'acct-1', 'https://example.com/');
    expect(result.verified).toBe(false);
  });
});

describe('every registered active module — no network calls when unauthorized', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => {
      throw new Error('a gated module attempted a network call without authorization');
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const unverified = {
    verified: false as const,
    domain: 'example.com',
    isLab: false as const,
    reason: 'no verified ownership record for this domain',
  };

  for (const [name, mod] of Object.entries(ACTIVE_MODULES)) {
    it(`"${name}" makes zero network calls given verified:false`, async () => {
      const ctx = buildModuleContext(unverified, 'https://example.com/', 'acct-1', 'scan-1');
      const result = await mod(ctx);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ran).toBe(false);
      expect(result.findings).toEqual([]);
    });
  }
});
