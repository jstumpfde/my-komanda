-- Альтернативный текст Сообщения 1 для нерабочего времени.
-- Если кандидат откликнулся вне рабочих часов вакансии (schedule_*),
-- и first_message_off_hours_enabled=true — отправляется альтернативный
-- текст вместо основного, Сообщения 2 и 3 при этом не создаются.
-- Логика — lib/schedule/can-send-now.ts (canSendNow) + process-queue.ts.
ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS first_message_off_hours_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS first_message_off_hours_delay_seconds integer NOT NULL DEFAULT 15;

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS first_message_off_hours_text text;
