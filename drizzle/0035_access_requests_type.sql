ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'access';
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS new_value TEXT;
