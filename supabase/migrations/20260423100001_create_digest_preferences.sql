-- Per-user preferences for the weekly bookmark digest email.
-- An hourly cron iterates this table and sends the digest when the user's
-- local day-of-week and hour match their chosen schedule.

CREATE TABLE IF NOT EXISTS public.digest_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    day_of_week SMALLINT NOT NULL DEFAULT 5,
    send_time TIME NOT NULL DEFAULT '10:00:00',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digest_preferences_day_of_week_check
        CHECK (day_of_week BETWEEN 0 AND 6)
);

ALTER TABLE public.digest_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own digest preferences"
    ON public.digest_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own digest preferences"
    ON public.digest_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own digest preferences"
    ON public.digest_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_digest_preferences_enabled
    ON public.digest_preferences(enabled)
    WHERE enabled = TRUE;

CREATE OR REPLACE FUNCTION update_digest_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_digest_preferences_updated_at
    BEFORE UPDATE ON public.digest_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_digest_preferences_updated_at();
