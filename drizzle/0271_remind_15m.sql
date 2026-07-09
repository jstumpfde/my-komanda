-- 4-й порог напоминания кандидату/HR-каналу — «за 15 минут» (09.07).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS remind_15m_sent_at timestamptz;
