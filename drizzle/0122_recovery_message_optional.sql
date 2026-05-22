-- #46: «Аварийное повторное сообщение» — опциональный блок.
-- Раньше при отправке первого сообщения, если в hh-чате уже было
-- исходящее от работодателя, process-queue использовал
-- aiSettings.reInviteMessage с UI placeholder'ом «Извините — в прошлом
-- сообщении была неактуальная ссылка...». HR'ы жаловались: кандидаты
-- получали дубликаты, текст автоматики.
--
-- Теперь два явных поля:
--   recovery_message_enabled — по умолчанию FALSE. Когда выключено,
--     автоматика recovery-сообщений НИКОГДА не работает — даже если
--     hh показывает previouslyInvited=true, шлём обычный inviteMessage.
--   recovery_message_text — пустая строка по умолчанию. Никакого
--     hardcoded fallback в коде.
--
-- Для существующих вакансий: enabled=false, текст пустой. Это
-- БЕЗОПАСНЫЙ дефолт — никаких сюрпризных автоматических сообщений.

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS recovery_message_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_message_text    text    NOT NULL DEFAULT '';
