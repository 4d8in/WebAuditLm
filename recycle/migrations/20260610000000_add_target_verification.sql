-- Domain ownership verification gate.
-- Any "active" scan module (payload injection, file/path probing, subdomain
-- enumeration, method/CORS probing) must check this table before running.
-- Passive, read-only checks (headers of the page you already fetched,
-- performance, SEO, accessibility) are NOT gated here — they're no different
-- from a normal browser GET, the same thing Lighthouse/PageSpeed does on any
-- public URL. Only unsolicited active testing requires proven ownership.

CREATE TYPE public.verification_method AS ENUM ('dns_txt', 'file_upload');
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'failed', 'revoked');

CREATE TABLE public.verified_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,                          -- normalized, lowercase, no scheme, no path
  method public.verification_method NOT NULL,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status public.verification_status DEFAULT 'pending' NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, domain)
);

CREATE INDEX idx_verified_targets_domain_status ON public.verified_targets (domain, status);

ALTER TABLE public.verified_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own verification claims"
  ON public.verified_targets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Edge functions use the service role and bypass RLS directly, so no
-- separate policy is needed for run-scan's authorization check.

COMMENT ON TABLE public.verified_targets IS
  'Proof-of-ownership records. A domain must have a row with status=verified '
  'for the requesting user before any active-testing module may run against it.';
