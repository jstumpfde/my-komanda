-- Группа 28: AI-помощник «Юлия» для создания вакансии.
-- Внутренний ассистент HR-модуля (НЕ путать с Аней — sales-assistant на лендинге).
-- Юлия ведёт HR через короткий диалог и в конце создаёт черновик вакансии.

CREATE TABLE IF NOT EXISTS yulia_conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id           uuid REFERENCES companies(id) ON DELETE CASCADE,
  context_type         text NOT NULL,                               -- "vacancy_creation" | (future contexts)
  state                jsonb NOT NULL DEFAULT '{}'::jsonb,           -- собранные данные в процессе диалога
  status               text NOT NULL DEFAULT 'active',               -- active | completed | abandoned
  resulting_entity_id  uuid,                                         -- id созданной вакансии при completed
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yulia_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES yulia_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,                       -- "user" | "assistant"
  content         text NOT NULL,
  pending_action  jsonb,                               -- { type, params, requires_confirmation }
  action_status   text,                                -- null | pending | confirmed | rejected | executed
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yulia_conv_user ON yulia_conversations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_yulia_conv_company ON yulia_conversations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yulia_msg_conv ON yulia_messages(conversation_id, created_at);
