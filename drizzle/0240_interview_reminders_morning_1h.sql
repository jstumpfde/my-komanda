-- #27: расширяем напоминания об интервью — «утром в день встречи» и «за час до».
-- Метки отправки на самом событии для идемпотентности (как remind_24h/2h).
-- NULL = ещё не слали. Аддитивно, безопасно на проде.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS remind_morning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS remind_1h_sent_at      timestamptz;
