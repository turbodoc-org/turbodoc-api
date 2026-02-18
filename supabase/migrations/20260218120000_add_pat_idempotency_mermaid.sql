-- Add Mermaid diagram format fields
ALTER TABLE public.diagrams
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'canvas_v1',
  ADD COLUMN IF NOT EXISTS mermaid_text TEXT;

ALTER TABLE public.diagrams
  ADD CONSTRAINT diagrams_format_check
  CHECK (format IN ('canvas_v1', 'mermaid_v2'));

-- Personal access tokens
CREATE TABLE IF NOT EXISTS public.personal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS personal_access_tokens_user_id_idx
  ON public.personal_access_tokens(user_id);

CREATE INDEX IF NOT EXISTS personal_access_tokens_last_used_at_idx
  ON public.personal_access_tokens(last_used_at DESC);

ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own PATs"
  ON public.personal_access_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own PATs"
  ON public.personal_access_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own PATs"
  ON public.personal_access_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own PATs"
  ON public.personal_access_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Idempotency keys
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  response JSONB NOT NULL,
  status INTEGER NOT NULL DEFAULT 201,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_unique_idx
  ON public.idempotency_keys(user_id, key, kind);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own idempotency keys"
  ON public.idempotency_keys
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own idempotency keys"
  ON public.idempotency_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own idempotency keys"
  ON public.idempotency_keys
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own idempotency keys"
  ON public.idempotency_keys
  FOR DELETE
  USING (auth.uid() = user_id);
