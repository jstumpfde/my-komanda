-- Funnel Builder MVP: экспериментальный конструктор воронки на вакансию.
--
-- funnel_builder_enabled — тумблер, включает использование конструктора для
-- данной вакансии. По умолчанию выключен. Cron'ы и старые компоненты этот
-- флаг не читают; они продолжают работать с уже существующими полями
-- (ai_chatbot_enabled, recovery_message_enabled, first_messages_chain и т.д.).
--
-- funnel_config_json — массив блоков воронки с порядком и статусом включения.
-- Структура: { "blocks": [ { "type": string, "order": int, "enabled": bool }, ... ] }
-- Метаданные блоков (label, description, required, incompatibleWith) живут
-- в коде в lib/funnel-builder/blocks.ts.
--
-- Принцип «двойной записи»: при сохранении конструктор обновляет и эту
-- jsonb-колонку, и старые поля совместимости (ai_chatbot_enabled и т.п.),
-- чтобы существующие cron'ы видели корректное состояние.

ALTER TABLE "vacancies"
  ADD COLUMN IF NOT EXISTS "funnel_builder_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "funnel_config_json"     jsonb   NOT NULL DEFAULT '{"blocks":[]}'::jsonb;
