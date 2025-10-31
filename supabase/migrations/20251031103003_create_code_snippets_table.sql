-- Create code_snippets table for storing code screenshots
CREATE TABLE IF NOT EXISTS public.code_snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    code TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'javascript',
    theme TEXT NOT NULL DEFAULT 'dracula',
    background_type TEXT NOT NULL DEFAULT 'gradient', -- 'gradient', 'solid', 'image'
    background_value TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding INTEGER NOT NULL DEFAULT 64,
    show_line_numbers BOOLEAN NOT NULL DEFAULT true,
    font_family TEXT NOT NULL DEFAULT 'Fira Code',
    font_size INTEGER NOT NULL DEFAULT 14,
    window_style TEXT NOT NULL DEFAULT 'mac', -- 'mac', 'none'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE public.code_snippets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own code snippets
CREATE POLICY "Users can view own code snippets"
    ON public.code_snippets
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own code snippets
CREATE POLICY "Users can insert own code snippets"
    ON public.code_snippets
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own code snippets
CREATE POLICY "Users can update own code snippets"
    ON public.code_snippets
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own code snippets
CREATE POLICY "Users can delete own code snippets"
    ON public.code_snippets
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_code_snippets_user_id ON public.code_snippets(user_id);
CREATE INDEX idx_code_snippets_created_at ON public.code_snippets(created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_code_snippets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_code_snippets_updated_at
    BEFORE UPDATE ON public.code_snippets
    FOR EACH ROW
    EXECUTE FUNCTION update_code_snippets_updated_at();
