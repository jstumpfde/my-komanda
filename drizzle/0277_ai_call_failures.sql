-- Сторож найма: быстрый детектор массового сбоя AI-вызовов (инцидент 13.07 —
-- лимит Anthropic исчерпан несколько часов подряд, screenResume/scoreResumeByAxes
-- тихо глотали ошибку в try/catch → console.warn + return null, 38 кандидатов
-- зависли без балла и без приглашения незамеченными).
--
-- Компактная таблица, НЕ расширяем ai_usage_log: там tenant_id NOT NULL и это
-- лог УСПЕШНЫХ вызовов (стоимость/токены) — для платформенного детектора
-- сбоев нужен только факт+момент+источник, без обязательной привязки к
-- компании (некоторые call-сайты не всегда её знают дёшево в catch-блоке).
-- company_id/vacancy_id — best-effort, nullable, для будущего per-company
-- разбора; сам платформенный детектор (classifyAiOutageSpike) их не требует.
--
-- Не журнал на века — как и cron_runs/admin_alerts, читаем короткое скользящее
-- окно (10-15 мин); старые строки можно чистить ретеншеном отдельно при
-- необходимости (не входит в эту миграцию).
CREATE TABLE IF NOT EXISTS ai_call_failures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL, -- напр. 'screen-resume' | 'axis-scorer' | 'score-test' | 'score-candidate-v2' | 'score-answers'
  company_id     uuid REFERENCES companies(id) ON DELETE CASCADE,
  vacancy_id     uuid REFERENCES vacancies(id) ON DELETE CASCADE,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_call_failures_created_idx ON ai_call_failures (created_at);
