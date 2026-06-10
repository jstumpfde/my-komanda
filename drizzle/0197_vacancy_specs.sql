-- Миграция 0197: таблица vacancy_specs (R4 Candidate Spec)
-- Единый источник «кого ищем» для вакансии. Спящий код нового контура.
-- НЕ применять автоматически — только вручную через psql после тестирования
-- на стейджинге.
--
-- Применение:
--   sudo -u postgres psql -d mykomanda -f /var/www/my-komanda/drizzle/0197_vacancy_specs.sql

CREATE TABLE IF NOT EXISTS "vacancy_specs" (
  "vacancy_id"  uuid    NOT NULL PRIMARY KEY
                         REFERENCES "vacancies"("id") ON DELETE CASCADE,
  "spec"        jsonb   NOT NULL DEFAULT '{}',
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by"  uuid    REFERENCES "users"("id") ON DELETE SET NULL
);

-- Индекс для быстрого поиска по updated_by (аудит/отладка)
CREATE INDEX IF NOT EXISTS "vacancy_specs_updated_by_idx"
  ON "vacancy_specs"("updated_by")
  WHERE "updated_by" IS NOT NULL;

COMMENT ON TABLE "vacancy_specs" IS
  'R4 Candidate Spec — единый источник "кого ищем" для вакансии. '
  'Новый контур (спящий код). Активируется per-вакансия через флаг useNewCore.';
