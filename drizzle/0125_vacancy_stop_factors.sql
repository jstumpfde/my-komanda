-- #61: per-vacancy stop factors with customizable rejection messages.
--
-- До этого стоп-факторы хранились только как company-wide defaults в UI
-- /hr/hiring-settings (без БД, через mock state). Теперь каждая вакансия
-- получает свой набор включённых факторов + параметры + текст отказа.
--
-- Структура колонки stop_factors_json (per vacancy):
--   {
--     "city":              { "enabled": bool, "allowedCities": string[], "allowRelocation": bool, "rejectionText": string },
--     "format":            { "enabled": bool, "allowedFormats": ("office"|"hybrid"|"remote")[], "rejectionText": string },
--     "age":               { "enabled": bool, "minAge": int, "maxAge": int, "rejectionText": string },
--     "experience":        { "enabled": bool, "minYears": number, "rejectionText": string },
--     "documents":         { "enabled": bool, "required": string[], "rejectionText": string },
--     "citizenship":       { "enabled": bool, "allowed": string[], "rejectionText": string },
--     "salaryExpectation": { "enabled": bool, "maxAmount": int, "rejectionText": string }
--   }
--
-- DEFAULT '{}' — для всех существующих вакансий стоп-факторы выключены, пока
-- HR не настроит явно. Логика применения в process-queue будет в отдельной
-- задаче (UI и хранение делаются сейчас, см. эскейп-клаузу в TZ).

ALTER TABLE "vacancies"
  ADD COLUMN IF NOT EXISTS "stop_factors_json" jsonb NOT NULL DEFAULT '{}'::jsonb;
