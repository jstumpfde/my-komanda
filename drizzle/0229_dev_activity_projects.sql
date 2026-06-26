-- 0229: мультипроектность dev-активности (табы) + интервал работы за день.
-- Добавляем project (ключ таба), first_at/last_at (первый/последний коммит дня).
-- Уникальность строки меняем с (person, day) на (project, day):
-- существующие строки относятся к Маркет Радару.

ALTER TABLE dev_activity_days ADD COLUMN IF NOT EXISTS project text NOT NULL DEFAULT 'market-radar';
ALTER TABLE dev_activity_days ADD COLUMN IF NOT EXISTS first_at timestamptz;
ALTER TABLE dev_activity_days ADD COLUMN IF NOT EXISTS last_at  timestamptz;

-- старая уникальность по (person, day) больше не нужна
DROP INDEX IF EXISTS dev_activity_person_day;
ALTER TABLE dev_activity_days DROP CONSTRAINT IF EXISTS dev_activity_person_day;

CREATE UNIQUE INDEX IF NOT EXISTS dev_activity_project_day ON dev_activity_days (project, day);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
