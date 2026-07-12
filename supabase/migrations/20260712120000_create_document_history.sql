-- Documents remain Markdown-first. Existing note IDs are preserved so v1 clients
-- and /v2/documents can coexist during the migration.
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS head_revision_id uuid,
  ADD COLUMN IF NOT EXISTS last_edited_by_device text;

CREATE TABLE IF NOT EXISTS document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  title text NOT NULL DEFAULT '',
  markdown text NOT NULL DEFAULT '',
  tags text,
  is_favorite boolean NOT NULL DEFAULT false,
  name text,
  change_summary text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, revision_number)
);

CREATE INDEX IF NOT EXISTS document_revisions_document_created_idx
  ON document_revisions(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_revisions_user_idx
  ON document_revisions(user_id);

ALTER TABLE document_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their document revisions"
  ON document_revisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their document revisions"
  ON document_revisions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can name their document revisions"
  ON document_revisions FOR UPDATE USING (auth.uid() = user_id);

-- Establish a reversible baseline for every existing note.
INSERT INTO document_revisions (
  document_id, user_id, revision_number, title, markdown, tags,
  is_favorite, name, change_summary, created_at
)
SELECT id, user_id::uuid, version, title, content, tags,
       COALESCE(is_favorite, false), 'Imported baseline',
       'Initial revision created during document migration',
       COALESCE(updated_at, created_at, now())
FROM notes
ON CONFLICT (document_id, revision_number) DO NOTHING;

UPDATE notes n
SET head_revision_id = r.id
FROM document_revisions r
WHERE r.document_id = n.id
  AND r.revision_number = n.version
  AND n.head_revision_id IS NULL;

COMMENT ON TABLE document_revisions IS
  'Immutable Markdown snapshots. Restores append a new revision and never rewrite history.';
COMMENT ON COLUMN notes.schema_version IS
  'Turbodoc Markdown schema version, including fenced embed directive syntax.';
