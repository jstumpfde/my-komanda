-- P0-28: кеш AI-оценки вакансии (vacancy-advisor).
-- Раньше при каждом заходе на таб «Анкета» компонент VacancyAdvisor делал
-- безусловный POST /api/ai/vacancy-advisor → Claude Sonnet → токены каждый
-- раз. Теперь результат хранится в БД, AI-запрос идёт только при первом
-- расчёте и при ручном «Переанализировать» (кнопка с RefreshCw).

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS ai_quality_score integer,
  ADD COLUMN IF NOT EXISTS ai_quality_details jsonb,
  ADD COLUMN IF NOT EXISTS ai_quality_analyzed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ai_quality_input_hash text;

-- ai_quality_input_hash — детерминистический SHA-256 от ключевых полей
-- анкеты (title, descriptionJson.anketa.{responsibilities,requirements,...}).
-- Если хеш не совпадает с сохранённым — UI показывает "анализ устарел"
-- (но НЕ запускает auto-refresh; кнопка ручная).
