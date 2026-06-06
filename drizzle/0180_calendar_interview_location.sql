-- Migration 0180: location and meeting_url for interview calendar events
-- location = office address (for in-person interviews)
-- meeting_url = video call link (for online interviews)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meeting_url TEXT;
