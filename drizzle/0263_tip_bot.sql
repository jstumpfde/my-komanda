-- 0262: Telegram-бот модуля «Типология» — состояние мастера диалога.
--
-- Бот дублирует веб-флоу /tip кнопками (lib/tip/bot/**). Состояние текущего
-- шага диалога (ждём дату/имя/контекст/...) хранится по chat_id — отдельная
-- таблица от tip_users (та уже есть, миграция 0260), потому что состояние
-- мастера эфемерно (сбрасывается после каждого прогона) и не относится к
-- профилю/балансу пользователя.
--
-- data_json — черновик ввода мастера (дата/имя/пол/контекст/...) + служебные
-- поля (last_update_id для dedupe повторных апдейтов Telegram при ретраях).
--
-- Риск: минимальный, новая независимая таблица.

CREATE TABLE IF NOT EXISTS tip_tg_sessions (
  chat_id     bigint PRIMARY KEY,
  state       text NOT NULL DEFAULT 'idle',
  data_json   jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
