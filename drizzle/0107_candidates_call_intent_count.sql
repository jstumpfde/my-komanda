-- Сессия 5: счётчик срабатываний callIntent на кандидата.
-- При входящем сообщении в hh, содержащем одно из vacancy keywords
-- (descriptionJson.automation.callIntent.keywords), scan-incoming
-- отправляет один из 3 эскалационных шаблонов и инкрементирует
-- этот счётчик. Когда count >= 3 — больше не реагируем на keywords
-- по этому кандидату в рамках этой вакансии.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS call_intent_count integer NOT NULL DEFAULT 0;
