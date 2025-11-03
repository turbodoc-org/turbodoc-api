-- Add version column to notes table for optimistic locking
ALTER TABLE notes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Initialize all existing notes to version 1
UPDATE notes SET version = 1 WHERE version IS NULL OR version = 0;

-- Create index on version for faster queries
CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(version);

-- Add comment to document the purpose
COMMENT ON COLUMN notes.version IS 'Version number for optimistic locking and conflict resolution. Increments on each update.';
