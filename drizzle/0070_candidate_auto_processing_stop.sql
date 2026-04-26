-- Add auto-processing stop flag for candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_processing_stopped BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_processing_stopped_reason TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_processing_stopped_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_candidates_auto_stopped ON candidates(auto_processing_stopped) WHERE auto_processing_stopped = true;
