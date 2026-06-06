-- Group 14: платформенное управление настройками + emergency broadcast.
--
-- platform_settings_migrations — журнал идемпотентных «миграций настроек»
-- (например: дополнить дефолтные стоп-слова у всех вакансий). Каждая миграция
-- имеет фиксированный id и применяется ровно один раз — runner проверяет
-- наличие записи перед apply().
--
-- platform_emergency_actions — журнал ad-hoc срочных действий через
-- /api/platform/emergency/* (kill switch, добавить стоп-слово всем, и т.д.).

CREATE TABLE IF NOT EXISTS platform_settings_migrations (
  id              text PRIMARY KEY,
  description     text NOT NULL,
  applied_at      timestamptz,
  affected_count  integer NOT NULL DEFAULT 0,
  rollback_data   jsonb,
  created_by      text,
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_psm_applied
  ON platform_settings_migrations(applied_at);

CREATE TABLE IF NOT EXISTS platform_emergency_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   text NOT NULL,
  payload       jsonb,
  executed_at   timestamptz NOT NULL DEFAULT now(),
  executed_by   text,
  result        jsonb
);

CREATE INDEX IF NOT EXISTS idx_pea_executed
  ON platform_emergency_actions(executed_at DESC);
