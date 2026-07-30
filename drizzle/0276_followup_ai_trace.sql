-- Фаза 1 «единого центра коммуникаций» (11.07): production-след адаптаций
-- агента коммуникаций. Сейчас реально ушедший дожиму текст нигде не хранится —
-- follow_up_messages.message_text это шаблон ДО renderTemplate, а после
-- adaptFollowupMessage (lib/comms-agent/adapt-followup-message.ts) текст мог
-- ещё и переписаться AI. HR не видит ни факта переписывания, ни итогового
-- текста.
--
-- sent_text  — финальный текст, ушедший кандидату (literal ИЛИ AI-адаптированный),
--              пишем при переводе касания в status='sent' (app/api/cron/follow-up/route.ts).
-- ai_adapted — true, если текст на этом касании заменён comms-agent (adapted.safe).
--
-- Дефолт ai_adapted=false — legacy-инвариант, старые/непилотные касания не
-- меняют поведение. sent_text nullable — для уже отправленных ДО этой миграции
-- строк восстановить факт-текст нечем.
ALTER TABLE follow_up_messages
  ADD COLUMN IF NOT EXISTS sent_text text,
  ADD COLUMN IF NOT EXISTS ai_adapted boolean NOT NULL DEFAULT false;
