-- ТЗ-1 Часть 3 (P0-22): расписание включено по умолчанию для НОВЫХ вакансий.
-- Существующие вакансии НЕ трогаем — только дефолт колонок.
ALTER TABLE vacancies ALTER COLUMN schedule_enabled SET DEFAULT true;
ALTER TABLE vacancies ALTER COLUMN schedule_end SET DEFAULT '19:30';
ALTER TABLE vacancies ALTER COLUMN schedule_working_days SET DEFAULT '[1,2,3,4,5,6]'::jsonb;
