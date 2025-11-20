-- Add favorites support to notes and bookmarks
-- Add sync metadata for offline support

-- Add is_favorite column to notes table
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- Add is_favorite column to bookmarks table
ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- Add sync metadata to notes table
ALTER TABLE notes ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE;

-- Add sync metadata to bookmarks table
ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for favorites filtering (partial indexes for better performance)
CREATE INDEX IF NOT EXISTS idx_notes_favorite 
    ON notes(user_id, is_favorite, created_at DESC) 
    WHERE is_favorite = TRUE;

CREATE INDEX IF NOT EXISTS idx_bookmarks_favorite 
    ON bookmarks(user_id, is_favorite, time_added DESC) 
    WHERE is_favorite = TRUE;

-- Create indexes for updated_at sorting (used for "recently modified" filter)
CREATE INDEX IF NOT EXISTS idx_notes_updated 
    ON notes(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookmarks_updated 
    ON bookmarks(user_id, updated_at DESC);

-- Create indexes for sync operations
CREATE INDEX IF NOT EXISTS idx_notes_synced_at 
    ON notes(user_id, synced_at);

CREATE INDEX IF NOT EXISTS idx_bookmarks_synced_at 
    ON bookmarks(user_id, synced_at);

-- Update existing rows to set synced_at to updated_at or created_at
UPDATE notes 
SET synced_at = COALESCE(updated_at, created_at) 
WHERE synced_at IS NULL;

UPDATE bookmarks 
SET synced_at = COALESCE(updated_at, created_at) 
WHERE synced_at IS NULL;

-- Create trigger to automatically update synced_at on changes
CREATE OR REPLACE FUNCTION update_synced_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.synced_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for notes
DROP TRIGGER IF EXISTS update_notes_synced_at ON notes;
CREATE TRIGGER update_notes_synced_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_synced_at_column();

-- Add triggers for bookmarks
DROP TRIGGER IF EXISTS update_bookmarks_synced_at ON bookmarks;
CREATE TRIGGER update_bookmarks_synced_at
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW
    EXECUTE FUNCTION update_synced_at_column();
