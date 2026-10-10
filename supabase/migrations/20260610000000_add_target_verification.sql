-- Domain ownership verification gate.
-- Any "active" scan module (payload injection, file/path probing, subdomain
-- enumeration, method/CORS probing) must check this table before running.
-- Passive, read-only checks (headers of the page you already fetched,
-- performance, SEO, accessibility) are NOT gated here — they're no different
-- from a normal browser GET, the same thing Lighthouse/PageSpeed does on any
-- public URL. Only unsolicited active testing requires proven ownership.
--
-- WebAuditLm adaptation (CLAUDE.md §5, confirmed 2026-10-10): scoped per
-- *account/team* (`account_id`) instead of per individual user, and extended
-- with `is_lab` instead of a separate signature table — a lab container
-- (Juice Shop, DVWA, WebGoat Edwin deployed himself) gets a row here with
-- `is_lab = true`, exactly like any other verified target. There is
-- deliberately no second table and no cryptographic-signature bypass path;
-- CLAUDE.md §6 explicitly defers a *future, separate* billing signature that
-- must never be combined with this ownership check.

CREATE TYPE public.verification_method AS ENUM ('dns_txt', 'file_upload');
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'failed', 'revoked');

CREATE TABLE public.verified_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,                      -- the team/account this verification belongs to
  domain TEXT NOT NULL,                          -- normalized, lowercase, no scheme, no path
  method public.verification_method NOT NULL,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status public.verification_status DEFAULT 'pending' NOT NULL,
  -- Lab containers Edwin/a teammate deployed themselves (Juice Shop, DVWA,
  -- WebGoat, etc). Still goes through the same verified_targets flow — this
  -- flag never skips the status='verified' check above, it only changes
  -- how the UI labels the target. See CLAUDE.md §5.
  is_lab BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (account_id, domain)
);

CREATE INDEX idx_verified_targets_domain_status ON public.verified_targets (domain, status);
CREATE INDEX idx_verified_targets_account ON public.verified_targets (account_id);

ALTER TABLE public.verified_targets ENABLE ROW LEVEL SECURITY;

-- Every member of an account can see and manage that account's verification
-- claims — this is what makes "any teammate verifies once, the whole team
-- is covered" work (CLAUDE.md §5), via whatever account-membership table/
-- function `is_account_member` resolves to in the surrounding app schema.
CREATE POLICY "Account members manage their account's verification claims"
  ON public.verified_targets FOR ALL
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

-- The backend's verify-target route and the gate's own lookups use the
-- service role and bypass RLS directly, so no separate policy is needed for
-- those server-side checks.

COMMENT ON TABLE public.verified_targets IS
  'Proof-of-ownership records, scoped per account/team. A domain must have a '
  'row with status=verified for the requesting account before any '
  'active-testing module may run against it. is_lab marks self-hosted lab '
  'containers but never bypasses the status=verified check.';
