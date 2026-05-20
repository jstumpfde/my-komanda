-- Сессия 4: Д0 цепочки дожима + источник.
-- Д0 — это исходная точка отсчёта расписания касаний (обычно дата
-- отклика кандидата на hh; fallback — дата ручного прогона «Разобрать»).
-- Хранится отдельно от scheduled_at, потому что сам scheduled_at
-- сдвигается окном работы / праздниками / jitter'ом.
--
-- d0_source — для аналитики и отладки причины fallback:
--   'hh_response'    : дата из negotiation.created_at (raw_data.created_at)
--   'manual_review'  : дата самого process-queue прогона
--   'branch_switch'  : момент переключения на ветку Б (открытие демо)

ALTER TABLE follow_up_messages
  ADD COLUMN IF NOT EXISTS chain_d0 timestamptz;

ALTER TABLE follow_up_messages
  ADD COLUMN IF NOT EXISTS chain_d0_source text;
