-- Список чатов-кандидатов, когда у лида НЕСКОЛЬКО общих чатов с владельцем и
-- систему не удалось однозначно выбрать один (source_confidence='ambiguous').
-- sourceChatId в этом случае — лишь предположение (самый недавний пост среди
-- кандидатов); UI честно помечает лид как требующий уточнения владельцем.
ALTER TABLE telegram_dm_leads ADD COLUMN IF NOT EXISTS candidate_chat_ids jsonb;
