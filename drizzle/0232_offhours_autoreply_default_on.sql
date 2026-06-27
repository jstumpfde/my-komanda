-- Автоответ нерабочего времени включён по умолчанию для НОВЫХ вакансий (решение Юрия 26.06).
-- SET DEFAULT влияет только на будущие INSERT'ы. Существующие вакансии хранят своё значение.
ALTER TABLE vacancies ALTER COLUMN first_message_off_hours_enabled SET DEFAULT true;
