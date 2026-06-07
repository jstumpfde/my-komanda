-- Sales: мультиканальный слой коммуникации (Спринт 1).
-- Реквизиты каналов per-tenant, диалоги с лидами, история сообщений.
-- Решение 07.06.2026: каналы = все через адаптеры, первый — Telegram.

CREATE TABLE IF NOT EXISTS "sales_channel_accounts" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "channel"             text NOT NULL,
  "title"               text,
  "is_active"           boolean DEFAULT true,
  "bot_token"           text,
  "from_address"        text,
  "external_account_id" text,
  "webhook_secret"      text,
  "config"              jsonb,
  "created_at"          timestamp DEFAULT now(),
  "updated_at"          timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_channel_accounts_tenant_idx"
  ON "sales_channel_accounts" ("tenant_id", "channel");

CREATE TABLE IF NOT EXISTS "sales_conversations" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"          uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "channel"            text NOT NULL,
  "channel_account_id" uuid NOT NULL REFERENCES "sales_channel_accounts"("id") ON DELETE CASCADE,
  "external_user_id"   text NOT NULL,
  "external_user_name" text,
  "contact_id"         uuid REFERENCES "sales_contacts"("id") ON DELETE SET NULL,
  "deal_id"            uuid REFERENCES "sales_deals"("id") ON DELETE SET NULL,
  "status"             text DEFAULT 'active' NOT NULL,
  "last_message_at"    timestamp,
  "created_at"         timestamp DEFAULT now(),
  "updated_at"         timestamp DEFAULT now(),
  CONSTRAINT "sales_conversations_uniq_user" UNIQUE ("channel_account_id", "external_user_id")
);

CREATE INDEX IF NOT EXISTS "sales_conversations_tenant_idx"
  ON "sales_conversations" ("tenant_id");

CREATE TABLE IF NOT EXISTS "sales_messages" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "conversation_id"     uuid NOT NULL REFERENCES "sales_conversations"("id") ON DELETE CASCADE,
  "direction"           text NOT NULL,
  "role"                text NOT NULL,
  "text"                text DEFAULT '' NOT NULL,
  "callback_data"       text,
  "external_message_id" text,
  "raw"                 jsonb,
  "created_at"          timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_messages_conversation_idx"
  ON "sales_messages" ("conversation_id", "created_at");
