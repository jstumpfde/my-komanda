-- F8 (28.06): «Скрыть у себя» в чате — перенос с localStorage на сервер.
-- Косметическое скрытие сообщений на нашей стороне (у кандидата в hh остаётся).
-- Раньше хранилось в localStorage браузера → терялось на другом устройстве.
-- Теперь — на кандидате, постоянно и одинаково везде.
--
-- Риск: минимальный (nullable jsonb с дефолтом []; легаси не трогаем).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS hidden_chat_msg_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
