-- 0181: расширение outbound_searches для кампаний (авто-режим + мягкие критерии)
ALTER TABLE outbound_searches
  ADD COLUMN IF NOT EXISTS mode           text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS score_threshold integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS daily_auto_limit integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS soft_criteria  text,
  ADD COLUMN IF NOT EXISTS active         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cron_run_at    timestamp with time zone;

-- Индекс для крона: быстро выбирать активные авто-кампании
CREATE INDEX IF NOT EXISTS outbound_searches_active_idx
  ON outbound_searches (active, mode)
  WHERE active = true AND mode = 'auto';
