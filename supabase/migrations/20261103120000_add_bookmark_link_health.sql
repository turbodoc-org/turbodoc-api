-- Broken link checker.
--
-- Each bookmark's URL is checked when it's created (BookmarkWorkflow) and then
-- re-checked weekly by the cron in src/scheduled/check-links.ts. A link is only
-- flagged 'broken' after two failed checks in a row, so a site that's briefly
-- down doesn't get flagged.

ALTER TABLE bookmarks
    ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS link_status_code INTEGER,
    ADD COLUMN IF NOT EXISTS link_error TEXT,
    ADD COLUMN IF NOT EXISTS link_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS link_failure_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookmarks
    ADD CONSTRAINT bookmarks_link_status_check
    CHECK (link_status IN ('unknown', 'ok', 'broken'));

-- Used by the cron to pick the bookmarks that are due a check, oldest first.
CREATE INDEX IF NOT EXISTS idx_bookmarks_link_checked_at
    ON bookmarks(link_checked_at ASC NULLS FIRST);

-- Used by the "Broken" filter (GET /v1/bookmarks?link_status=broken).
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_broken_links
    ON bookmarks(user_id)
    WHERE link_status = 'broken';

-- A new URL hasn't been checked yet: forget the previous URL's result.
CREATE OR REPLACE FUNCTION reset_bookmark_link_health()
RETURNS TRIGGER AS $$
BEGIN
    NEW.link_status := 'unknown';
    NEW.link_status_code := NULL;
    NEW.link_error := NULL;
    NEW.link_checked_at := NULL;
    NEW.link_failure_count := 0;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reset_bookmark_link_health ON bookmarks;
CREATE TRIGGER reset_bookmark_link_health
    BEFORE UPDATE OF url ON bookmarks
    FOR EACH ROW
    WHEN (OLD.url IS DISTINCT FROM NEW.url)
    EXECUTE FUNCTION reset_bookmark_link_health();

-- True when an update only touched the link-check columns. Such updates must
-- not bump updated_at / synced_at, otherwise the weekly check would mark every
-- bookmark as modified (re-syncing clients and reordering "recently modified").
CREATE OR REPLACE FUNCTION bookmark_link_only_update(old_row bookmarks, new_row bookmarks)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT (to_jsonb(old_row) - ARRAY[
                'link_status', 'link_status_code', 'link_error', 'link_checked_at',
                'link_failure_count', 'updated_at', 'synced_at'
            ])
         = (to_jsonb(new_row) - ARRAY[
                'link_status', 'link_status_code', 'link_error', 'link_checked_at',
                'link_failure_count', 'updated_at', 'synced_at'
            ]);
$$;

DROP TRIGGER IF EXISTS update_bookmarks_updated_at ON bookmarks;
CREATE TRIGGER update_bookmarks_updated_at
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW
    WHEN (NOT bookmark_link_only_update(OLD, NEW))
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookmarks_synced_at ON bookmarks;
CREATE TRIGGER update_bookmarks_synced_at
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW
    WHEN (NOT bookmark_link_only_update(OLD, NEW))
    EXECUTE FUNCTION update_synced_at_column();

-- Records a batch of link-check results in one round trip.
--
-- results: [{ "id": uuid, "url": text, "outcome": "ok" | "failed" | "unsupported",
--             "status_code": int | null, "error": text | null }]
--
-- * Rows whose URL changed since the check started are ignored (url must match).
-- * A failure only counts toward the consecutive-failure total if the previous
--   check was over an hour ago, so the workflow and the cron checking the same
--   new bookmark at the same moment can't flag it on their own.
-- * Two consecutive failures => 'broken'. Any success resets to 'ok'.
-- * 'unsupported' (non-http URLs) stays 'unknown' and isn't retried until next week.
CREATE OR REPLACE FUNCTION record_bookmark_link_checks(results JSONB)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
    WITH input AS (
        SELECT r.id, r.url, r.outcome, r.status_code, r.error
        FROM jsonb_to_recordset(results)
            AS r(id UUID, url TEXT, outcome TEXT, status_code INTEGER, error TEXT)
    ),
    computed AS (
        SELECT
            b.id,
            i.outcome,
            i.status_code,
            i.error,
            CASE
                WHEN i.outcome <> 'failed' THEN 0
                WHEN b.link_failure_count > 0
                     AND b.link_checked_at > NOW() - INTERVAL '1 hour'
                    THEN b.link_failure_count
                ELSE b.link_failure_count + 1
            END AS failure_count,
            b.link_status AS previous_status
        FROM bookmarks b
        JOIN input i ON i.id = b.id AND i.url = b.url
    )
    UPDATE bookmarks b
    SET
        link_failure_count = c.failure_count,
        link_status = CASE
            WHEN c.outcome = 'ok' THEN 'ok'
            WHEN c.outcome = 'unsupported' THEN 'unknown'
            WHEN c.failure_count >= 2 THEN 'broken'
            ELSE c.previous_status
        END,
        link_status_code = c.status_code,
        link_error = c.error,
        link_checked_at = NOW()
    FROM computed c
    WHERE b.id = c.id;
$$;

-- Only the API's service role (cron + workflow) may record results.
REVOKE EXECUTE ON FUNCTION record_bookmark_link_checks(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_bookmark_link_checks(JSONB) TO service_role;
