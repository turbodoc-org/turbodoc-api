-- Create diagrams table
CREATE TABLE IF NOT EXISTS public.diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Diagram',
  shapes JSONB NOT NULL DEFAULT '[]'::jsonb,
  connections JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS diagrams_user_id_idx ON public.diagrams(user_id);
CREATE INDEX IF NOT EXISTS diagrams_updated_at_idx ON public.diagrams(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can view their own diagrams
CREATE POLICY "Users can view their own diagrams"
  ON public.diagrams
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own diagrams
CREATE POLICY "Users can create their own diagrams"
  ON public.diagrams
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own diagrams
CREATE POLICY "Users can update their own diagrams"
  ON public.diagrams
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own diagrams
CREATE POLICY "Users can delete their own diagrams"
  ON public.diagrams
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.diagrams
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
