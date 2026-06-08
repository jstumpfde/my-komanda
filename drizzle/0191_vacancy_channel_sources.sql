-- Источники откликов на вакансию (channel_sources).
-- Определяет, с каких площадок принимаются отклики: 'hh' | 'avito'.
-- Дефолт ['hh'] — все существующие вакансии продолжают работать как раньше.
-- При добавлении 'avito' система начинает принимать входящие через Авито Messenger API.

ALTER TABLE "vacancies"
  ADD COLUMN IF NOT EXISTS "channel_sources" jsonb NOT NULL DEFAULT '["hh"]'::jsonb;
