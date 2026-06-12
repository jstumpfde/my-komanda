-- Миграция 0202: флаг паузы исходящей очереди сообщений на уровне вакансии.
-- Когда outbound_paused = true — cron follow-up пропускает все pending-сообщения
-- этой вакансии (дожимы, приглашения, тесты).
-- Идемпотентная: ADD COLUMN IF NOT EXISTS.

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS outbound_paused boolean NOT NULL DEFAULT false;
