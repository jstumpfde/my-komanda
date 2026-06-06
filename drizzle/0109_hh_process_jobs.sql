-- Сессия 7 (hotfix): persistent tracking фоновых job'ов разбора
-- hh-очереди. До этого POST /api/integrations/hh/process-queue был
-- синхронным и блокировал HTTP-соединение на всё время разбора
-- (до 8-10 минут для 200 кандидатов с rate-limit Сессии 4). Nginx
-- 60-сек upstream timeout рвал соединение, HR видел «сайт лежит».
--
-- Теперь POST создаёт строку status='queued', планирует разбор
-- в фоне через setImmediate, возвращает {jobId, status} за <500мс.
-- UI делает polling GET /status?jobId=... до завершения.
--
-- Persistence нужна потому что PM2-процесс может ребутнуться
-- посреди разбора; status='running' с stale_at < NOW()-15min
-- считается зависшим (можно вручную почистить из админки).

CREATE TABLE IF NOT EXISTS hh_process_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vacancy_id          uuid REFERENCES vacancies(id) ON DELETE SET NULL,
  -- 'queued' | 'running' | 'completed' | 'failed' | 'stopped'
  status              text NOT NULL DEFAULT 'queued',
  limit_requested     integer,
  delay_seconds       integer,
  processed           integer NOT NULL DEFAULT 0,
  invited             integer NOT NULL DEFAULT 0,
  rejected            integer NOT NULL DEFAULT 0,
  kept                integer NOT NULL DEFAULT 0,
  deferred_off_hours  integer NOT NULL DEFAULT 0,
  results             jsonb NOT NULL DEFAULT '[]'::jsonb,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  started_at          timestamptz,
  finished_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hh_process_jobs_company_status
  ON hh_process_jobs (company_id, status, created_at DESC);
