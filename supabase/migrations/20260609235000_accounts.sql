-- Minimal account/team scaffold needed for CLAUDE.md §5's account-scoped
-- verification model. Not a full billing/org system — just enough for
-- `verified_targets` to be meaningfully scoped per account instead of per
-- individual user, and for RLS to resolve account membership.

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.account_members (
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  PRIMARY KEY (account_id, user_id)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_account_member(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = target_account_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Members can see their own accounts"
  ON public.accounts FOR SELECT
  USING (public.is_account_member(id));

CREATE POLICY "Members can see their account's membership rows"
  ON public.account_members FOR SELECT
  USING (public.is_account_member(account_id));

COMMENT ON TABLE public.accounts IS
  'A team/account. verified_targets and scans are scoped to this, not to an individual user (CLAUDE.md §5).';
COMMENT ON FUNCTION public.is_account_member IS
  'True if the current authenticated user belongs to the given account. Used by every account-scoped RLS policy.';
