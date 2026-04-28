-- v5: автомат-пауза по AI-классификации ответов в hh-чате + реферальные дубли.

-- 1. Поле automation_paused — выставляется AI-классификатором при rejection /
--    wants_personal_contact. Все cron-автоматизации обязаны фильтровать его.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS automation_paused BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Поле referred_by_short_id — short_id того кандидата, чьей ссылкой
--    воспользовался текущий посетитель. Сохраняем оригинальный short_id, чтобы
--    можно было нарисовать цепочку рефералов в UI.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS referred_by_short_id TEXT;

CREATE INDEX IF NOT EXISTS idx_candidates_referred_by
  ON candidates(referred_by_short_id);
