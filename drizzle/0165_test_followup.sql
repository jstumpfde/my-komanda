-- Дожим по тесту (две ветки), по образцу демо-дожима. Конфиг — в той же
-- follow_up_campaigns. test_enabled=false по умолчанию → ничего не шлётся,
-- пока HR явно не включит на странице «Дожим».
--   test_preset           — off|soft|standard|aggressive (расписание дней)
--   test_messages         — ветка «не открыл тест» (массив до 9 шаблонов)
--   test_messages_opened  — ветка «открыл, но не заполнил»
ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS test_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_preset          text    NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS test_messages        jsonb,
  ADD COLUMN IF NOT EXISTS test_messages_opened jsonb;
