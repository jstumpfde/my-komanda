-- Per-company working hours для cron-фильтрации (задача 4 ТЗ 2026-05-08).
-- Структура поля (когда не NULL):
--   { "tz": "Europe/Moscow", "days": [1,2,3,4,5],
--     "from": "09:00", "to": "21:00", "holidays": ["2026-05-09", ...] }
-- Если поле NULL — fallback на DEFAULT_WORKING_HOURS из lib/utils/working-hours.ts
-- (Mon-Fri 09:00-21:00 Europe/Moscow), чтобы существующие компании не страдали
-- от cron'а 24/7.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS working_hours JSONB;
