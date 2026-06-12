-- Внешние участники события календаря (не из платформы) — free-text имена/email.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS external_participants jsonb DEFAULT '[]'::jsonb;
