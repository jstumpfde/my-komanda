-- C6: напоминания об интервью (24ч/2ч).
-- Помечаем на самом событии календаря, когда отправлено каждое напоминание,
-- чтобы cron не слал повторно. NULL = ещё не отправляли.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS remind_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS remind_2h_sent_at  timestamptz;

-- Частичный индекс под выборку «интервью, которым ещё не слали 24ч-напоминание».
CREATE INDEX IF NOT EXISTS calendar_events_interview_reminder_idx
  ON calendar_events (start_at)
  WHERE type = 'interview';
