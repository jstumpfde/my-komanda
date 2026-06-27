-- Option 2 (страж сообщений): придержанные на проверку HR сообщения.
-- Когда у компании включён messageGuardHold.enabled и страж нашёл серьёзную
-- проблему (сырая переменная / пустое) — сообщение НЕ уходит, а кладётся сюда,
-- HR получает уведомление и решает: отправить вручную / отклонить.
CREATE TABLE IF NOT EXISTS held_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hh_response_id text,
  candidate_id   uuid REFERENCES candidates(id) ON DELETE SET NULL,
  message_text   text NOT NULL,
  issues         jsonb NOT NULL DEFAULT '[]'::jsonb,
  source         text,
  status         text NOT NULL DEFAULT 'held',   -- held | sent | dismissed
  created_at     timestamp NOT NULL DEFAULT now(),
  resolved_at    timestamp
);
CREATE INDEX IF NOT EXISTS held_messages_company_status_idx ON held_messages (company_id, status);
