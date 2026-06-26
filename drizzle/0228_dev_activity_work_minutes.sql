-- 0228: оценка отработанного времени по дням (по таймстампам коммитов).
-- Эвристика git-hours, см. lib/dev-activity/scoring.ts (estimateWorkMinutes).
-- Это оценка по коммитам, не табель.

ALTER TABLE dev_activity_days
  ADD COLUMN IF NOT EXISTS work_minutes integer NOT NULL DEFAULT 0;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
