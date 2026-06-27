-- Дефолтное расписание новых вакансий: Пн–Пт 09:00–18:30 (решение Юрия 26.06).
-- SET DEFAULT влияет ТОЛЬКО на будущие INSERT'ы без явного значения.
-- Существующие вакансии хранят свои значения — НЕ трогаются.
ALTER TABLE vacancies ALTER COLUMN schedule_end          SET DEFAULT '18:30';
ALTER TABLE vacancies ALTER COLUMN schedule_working_days SET DEFAULT '[1, 2, 3, 4, 5]'::jsonb;
