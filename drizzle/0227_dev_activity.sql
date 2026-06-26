-- 0227: Dev-activity tracker — журнал продуктивности подрядчика.
-- Одна строка = один день одного человека (агрегат по всем его репозиториям).
-- Разбивка по репо, список задач и сырьё сбора — в jsonb-полях.
-- Заполняется cron'ом /api/cron/dev-activity (SSH → git → Claude),
-- читается страницей /admin/dev-activity. Подробности — lib/dev-activity/*.

CREATE TABLE IF NOT EXISTS dev_activity_days (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person        text NOT NULL,
  day           date NOT NULL,
  commit_count  integer NOT NULL DEFAULT 0,
  lines_added   integer NOT NULL DEFAULT 0,
  lines_removed integer NOT NULL DEFAULT 0,
  wip_files     integer NOT NULL DEFAULT 0,
  task_count    integer NOT NULL DEFAULT 0,
  score         double precision NOT NULL DEFAULT 0,
  substance     text,
  verdict       text,
  baseline      double precision,
  summary       text,
  tasks         jsonb,
  repos         jsonb,
  raw           jsonb,
  collected_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dev_activity_person_day ON dev_activity_days (person, day);
CREATE INDEX IF NOT EXISTS dev_activity_day_idx ON dev_activity_days (day);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
