-- 0176: Standalone-расписание компании (/settings/schedule).
-- Отдельное хранилище общего рабочего времени компании. НЕ связано с
-- can-send-now (vacancies.schedule_*), календарём и hiring-settings —
-- см. memory schedule-three-systems-keep-separate. Просто сохраняет своё значение.
-- Структура (jsonb): {
--   schedule: [{ enabled, from, to }] x7 (Пн..Вс),
--   timezone, country,
--   lunch: { enabled, from, to },
--   customHolidays: [{ id, date, name }],
--   absences: [{ id, employee, type, dateFrom, dateTo, status, comment }]
-- }
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS work_schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb;
