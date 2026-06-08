-- Sales: именованные пресеты настроек чатбота (сохранять/применять наборы).
CREATE TABLE IF NOT EXISTS "sales_bot_presets" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"  uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "settings"   jsonb NOT NULL,
  "is_default" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_bot_presets_tenant_idx"
  ON "sales_bot_presets" ("tenant_id");
