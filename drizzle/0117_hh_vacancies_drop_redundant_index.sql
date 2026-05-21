-- P0-49 cleanup: убираем дубль уникальности на (company_id, hh_vacancy_id).
-- Контекст: на проде руками был создан UNIQUE INDEX hh_vacancies_unique_company_hhid;
-- одновременно в schema.ts (через Drizzle, миграция 0032) уже есть UNIQUE CONSTRAINT
-- uq_hh_vacancies_company_hh на тех же колонках. Два объекта избыточны.
--
-- Решение: оставить constraint (он в schema.ts → переживёт drizzle generate),
-- удалить index. На окружениях, где index не создавался — IF EXISTS no-op.
--
-- ВАЖНО: миграция 0115_hh_vacancies_unique_index.sql, которая создавала этот
-- index в drizzle-стиле, удалена из репозитория этим же коммитом. На проде
-- её никто не запускал (там было ручное `CREATE UNIQUE INDEX ...`).

DROP INDEX IF EXISTS hh_vacancies_unique_company_hhid;
