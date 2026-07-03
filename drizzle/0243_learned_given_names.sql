-- Самообучающийся ПЛАТФОРМЕННЫЙ (глобальный, без company_id) справочник имён
-- кандидатов (фидбэк Юрия 03.07.2026). Майнится cron'ом
-- /api/cron/learn-given-names из hh_responses.raw_data по всей платформе.
-- Идемпотентно.
CREATE TABLE IF NOT EXISTS learned_given_names (
  name_norm    text PRIMARY KEY,
  display_name text NOT NULL,
  occurrences  integer NOT NULL DEFAULT 0,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now()
);
