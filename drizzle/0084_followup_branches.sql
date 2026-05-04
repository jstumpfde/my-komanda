-- 0084_followup_branches.sql
-- Две ветки дожима:
--   А: 'not_opened'         — кандидат получил приглашение, но не открыл демо
--   Б: 'opened_not_finished' — открыл демо, но не дошёл до конца
--
-- Колонка branch на follow_up_messages маркирует, к какой ветке относится
-- запланированное касание. Default 'not_opened' оставляет существующие
-- pending-сообщения в ветке А (так они и создавались до этого изменения).
--
-- Колонка custom_messages_opened на follow_up_campaigns — кастомные тексты
-- ветки Б. Если NULL, используются дефолты из default-messages.ts
-- (DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED).

ALTER TABLE follow_up_messages
  ADD COLUMN IF NOT EXISTS branch TEXT NOT NULL DEFAULT 'not_opened';

ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS custom_messages_opened JSONB;

-- Индекс на отмену pending-сообщений ветки А при переходе кандидата
-- в demo_opened (см. lib/candidates/mark-demo-opened.ts).
CREATE INDEX IF NOT EXISTS idx_follow_up_messages_pending_branch
  ON follow_up_messages (candidate_id, branch, status)
  WHERE status = 'pending';
