-- Отложенный отказ кандидата (никаких мгновенных авто-отказов).
-- Вместо немедленного stage='rejected' + discard, точки отказа помечают
-- кандидата «ожидает отказа»: cron /api/cron/pending-rejections исполнит его
-- по истечении задержки (vacancy.aiProcessSettings.rejectionDelayMinutes,
-- дефолт 300 мин) И только в рабочее время вакансии (canSendNow).
--
-- pending_rejection_at  — момент, КОГДА можно исполнять отказ (триггер + задержка).
--                         NULL = отказ не запланирован.
-- pending_rejection_reason — причина (stop_factor:city / prequalification_failed /
--                         ai_rejection / security_* и т.п.) — для лога и текста.
-- pending_rejection_set_at — когда отказ был запланирован (для UI «отказ через …»).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS pending_rejection_at     timestamptz,
  ADD COLUMN IF NOT EXISTS pending_rejection_reason text,
  ADD COLUMN IF NOT EXISTS pending_rejection_set_at timestamptz;

-- Частичный индекс: cron берёт только запланированные, время которых наступило.
CREATE INDEX IF NOT EXISTS candidates_pending_rejection_idx
  ON candidates (pending_rejection_at)
  WHERE pending_rejection_at IS NOT NULL;
