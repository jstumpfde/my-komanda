-- Рабочие часы вакансии: ограничивают окно отправки сообщений
-- (демо-приглашений и касаний воронки дожима).
-- Текстом — чтобы не путаться с time/timestamp и таймзонами на уровне БД,
-- проверка делается в JS через Intl.DateTimeFormat с timezone из vacancy.
-- Старые значения тоже остаются в descriptionJson.automation.workingHours
-- (UI продолжает писать туда + код синхронизирует в новые колонки).

ALTER TABLE "vacancies"
  ADD COLUMN IF NOT EXISTS "working_hours_enabled"   boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "working_hours_start"     text          NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "working_hours_end"       text          NOT NULL DEFAULT '19:55',
  ADD COLUMN IF NOT EXISTS "working_hours_timezone"  text          NOT NULL DEFAULT 'Europe/Moscow';
