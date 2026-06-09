-- Счётчики воронки hh по вакансии (из /negotiations collections) — точные числа
-- из интерфейса hh. Обновляет крон hh-vacancy-sync. Отчёт показывает их в
-- hh-колонках (Откликов/Собес/Нанят/Не подходит/Канд. отказался).
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS hh_funnel_json jsonb;
