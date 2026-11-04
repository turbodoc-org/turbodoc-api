-- Every content change to a note now records a revision and moves
-- notes.head_revision_id in the same statement, whichever path wrote it
-- (v2 documents, v1 notes, batch, MCP, older app builds). Clients that send
-- base_revision_id can therefore always detect concurrent edits and merge them.

-- 1. Revision graph ---------------------------------------------------------

ALTER TABLE document_revisions
  ADD COLUMN IF NOT EXISTS parent_revision_id uuid
    REFERENCES document_revisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_parent_id uuid
    REFERENCES document_revisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'edit';

ALTER TABLE document_revisions
  DROP CONSTRAINT IF EXISTS document_revisions_kind_check;
ALTER TABLE document_revisions
  ADD CONSTRAINT document_revisions_kind_check
  CHECK (kind IN ('edit', 'merge', 'restore', 'submitted'));

-- 'submitted' revisions store what a client sent before the server merged it.
-- They are merge bases, not points in the document's main history, so they
-- have no revision number.
ALTER TABLE document_revisions ALTER COLUMN revision_number DROP NOT NULL;
ALTER TABLE document_revisions
  DROP CONSTRAINT IF EXISTS document_revisions_number_check;
ALTER TABLE document_revisions
  ADD CONSTRAINT document_revisions_number_check
  CHECK ((kind = 'submitted') = (revision_number IS NULL));

COMMENT ON COLUMN document_revisions.parent_revision_id IS
  'Head revision this revision was written on top of.';
COMMENT ON COLUMN document_revisions.merge_parent_id IS
  'For merge revisions: the submitted client snapshot that was merged in.';
COMMENT ON COLUMN document_revisions.kind IS
  'edit | merge | restore | submitted (unmerged client snapshot, used as a merge base).';

-- The revision row is inserted before the note row on INSERT, so the document
-- FK is checked at commit time.
ALTER TABLE document_revisions
  ALTER CONSTRAINT document_revisions_document_id_fkey DEFERRABLE INITIALLY DEFERRED;

-- 2. Backfill notes whose head drifted ---------------------------------------
-- v1 and MCP writes before this migration changed content without recording a
-- revision. Record the current content so every head matches its revision.

INSERT INTO document_revisions (
  document_id, user_id, revision_number, title, markdown, tags, is_favorite,
  change_summary, kind, parent_revision_id, created_at
)
SELECT n.id, n.user_id, n.version + 1, n.title, n.content, n.tags,
       COALESCE(n.is_favorite, false),
       'Recorded during revision graph migration', 'edit', head.id,
       COALESCE(n.updated_at, now())
FROM notes n
LEFT JOIN document_revisions head ON head.id = n.head_revision_id
WHERE head.id IS NULL
   OR head.title IS DISTINCT FROM n.title
   OR head.markdown IS DISTINCT FROM n.content
   OR head.tags IS DISTINCT FROM n.tags
   OR head.is_favorite IS DISTINCT FROM COALESCE(n.is_favorite, false)
ON CONFLICT (document_id, revision_number) DO NOTHING;

-- Point those notes at the new revision. This runs before the trigger below
-- exists, which would otherwise treat it as a metadata-only update. Timestamp
-- triggers are paused so the backfill does not reorder anyone's notes.
ALTER TABLE notes DISABLE TRIGGER USER;
UPDATE notes n
SET head_revision_id = r.id,
    version = n.version + 1
FROM document_revisions r
WHERE r.document_id = n.id
  AND r.revision_number = n.version + 1
  AND r.change_summary = 'Recorded during revision graph migration';
ALTER TABLE notes ENABLE TRIGGER USER;

-- 3. Record a revision on every content change --------------------------------

-- Write-only: a writer may set this to describe the revision it is creating.
-- The trigger reads it and always clears it, so it is never stored.
-- Keys: kind, merge_parent_id, device_id, change_summary, name.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS revision_meta jsonb;

CREATE OR REPLACE FUNCTION public.notes_record_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.revision_meta, '{}'::jsonb);
  revision_id uuid := gen_random_uuid();
BEGIN
  NEW.revision_meta := NULL;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title
       AND NEW.content IS NOT DISTINCT FROM OLD.content
       AND NEW.tags IS NOT DISTINCT FROM OLD.tags
       AND COALESCE(NEW.is_favorite, false) = COALESCE(OLD.is_favorite, false)
       AND NOT meta ? 'kind' THEN
      -- Metadata-only or no-op write: keep the version and head.
      NEW.version := OLD.version;
      NEW.head_revision_id := OLD.head_revision_id;
      RETURN NEW;
    END IF;
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := 1;
  END IF;

  INSERT INTO document_revisions (
    id, document_id, user_id, revision_number, title, markdown, tags, is_favorite,
    name, change_summary, device_id, kind, parent_revision_id, merge_parent_id
  ) VALUES (
    revision_id,
    NEW.id,
    NEW.user_id,
    NEW.version,
    NEW.title,
    NEW.content,
    NEW.tags,
    COALESCE(NEW.is_favorite, false),
    meta->>'name',
    meta->>'change_summary',
    COALESCE(meta->>'device_id', NEW.last_edited_by_device),
    COALESCE(meta->>'kind', 'edit'),
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.head_revision_id END,
    (meta->>'merge_parent_id')::uuid
  );

  NEW.head_revision_id := revision_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_record_revision ON notes;
CREATE TRIGGER notes_record_revision
  BEFORE INSERT OR UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_record_revision();

-- 4. Live updates ------------------------------------------------------------
-- Open editors subscribe to changes on their note. Realtime applies the notes
-- RLS policies, so users only receive their own rows.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notes'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;
END;
$$;
