-- Фаза 2 Воронки v2: фиксация исхода собеседования (Tab «Итоги интервью»).
-- Идемпотентно — безопасно катить повторно.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS interview_outcome text;        -- held | no_show | rescheduled
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS interview_rating integer;      -- впечатление 1-5
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS interview_decision text;       -- advance | offer | reject | reserve
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS interview_notes text;          -- заметка HR
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS interview_outcome_at timestamptz; -- когда зафиксирован итог
