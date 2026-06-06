-- #21: серия первых сообщений (до 3) вместо одного invite.
-- Раньше у вакансии было одно поле ai_process_settings.inviteMessage —
-- единственный текст, который шёл сразу после клейма hh_response.
-- Теперь HR может настроить цепочку из 3 шагов с тумблерами и задержками,
-- для ощущения "живого" общения без AI.
--
-- Формат jsonb-массива:
--   [
--     { "enabled": true,  "delaySeconds": 15,  "text": "..." },
--     { "enabled": false, "delaySeconds": 60,  "text": "..." },
--     { "enabled": false, "delaySeconds": 180, "text": "..." }
--   ]
--
-- Backward compat: если массив пустой → процессор использует старый
-- ai_process_settings.inviteMessage как Сообщение 1 с delaySeconds из
-- automation.delaySeconds (или delayMinutes * 60).

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS first_messages_chain jsonb NOT NULL DEFAULT '[]'::jsonb;
