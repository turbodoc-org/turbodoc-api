-- Add content-extraction columns to bookmarks for the weekly digest feature.
-- A per-bookmark Cloudflare Workflow crawls the URL, summarises it with
-- Workers AI, and writes the result back into these columns.

ALTER TABLE bookmarks
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS content_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS content_processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS workflow_instance_id TEXT;

ALTER TABLE bookmarks
    ADD CONSTRAINT bookmarks_content_status_check
    CHECK (content_status IN ('pending', 'processing', 'succeeded', 'failed'));

-- Index used by the weekly digest query (per-user, within the last 7 days).
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_time_added
    ON bookmarks(user_id, time_added DESC);

-- Index used when looking up stuck workflows for retries/debugging.
CREATE INDEX IF NOT EXISTS idx_bookmarks_content_status
    ON bookmarks(content_status)
    WHERE content_status IN ('pending', 'processing');
