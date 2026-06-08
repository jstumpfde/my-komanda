-- Sales: конфигурация чатбота на уровне салона (тенанта). Спринт 2.
-- Аналог полей vacancy.aiChatbot* в HR. settings(jsonb) = SalesChatbotSettings.

CREATE TABLE IF NOT EXISTS "sales_bot_configs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "is_enabled"    boolean DEFAULT true,
  "bot_name"      text,
  "greeting"      text,
  "system_prompt" text,
  "settings"      jsonb,
  "created_at"    timestamp DEFAULT now(),
  "updated_at"    timestamp DEFAULT now(),
  CONSTRAINT "sales_bot_configs_tenant_uniq" UNIQUE ("tenant_id")
);
