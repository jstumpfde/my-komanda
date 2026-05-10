-- Удаляем мёртвую таблицу funnel_stages.
-- Сидер заполнил её одинаковыми 6 стадиями для всех 4 компаний (24 строки),
-- но никем не читалась. Реальная воронка теперь в vacancies.description_json.pipeline
-- (формат v2 из lib/stages.ts, см. Фазы 2-3 рефакторинга 2026-05-10).

DROP TABLE IF EXISTS funnel_stages CASCADE;
