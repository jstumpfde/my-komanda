-- P0-30: журнал запусков критичных cron-эндпоинтов.
-- Каждый cron вызывает lib/cron/record-run.ts → recordCronRun(...) на старте
-- и обновляет на финише. /api/cron/health-check читает таблицу, чтобы
-- понять, какие cron'ы давно не запускались.

CREATE TABLE IF NOT EXISTS cron_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name       text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running', -- 'running' | 'ok' | 'error' | 'busy'
  duration_ms     integer,
  error_message   text,
  metadata        jsonb
);

CREATE INDEX IF NOT EXISTS cron_runs_name_started_idx
ON cron_runs(cron_name, started_at);
