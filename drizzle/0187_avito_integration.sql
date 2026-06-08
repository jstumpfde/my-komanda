-- Авито-интеграция: скелет (фаза 1, выключено по умолчанию).
-- По аналогии с hh_integrations: одна строка на компанию.
-- Таблица создаётся сейчас для типобезопасного хранения ключей и флага;
-- реальный OAuth-флоу реализуется в фазе 2.
--
-- Поля:
--   client_id / client_secret  — OAuth ключи компании (client_credentials path)
--   access_token / expires_at  — кэшированный токен (обновляется адаптером)
--   user_id                    — числовой ID пользователя Авито (нужен для API-путей)
--   is_enabled                 — feature-flag: false по умолчанию, HR включает вручную
--   is_active                  — системный: false если интеграция отозвана/сломана

CREATE TABLE IF NOT EXISTS "avito_integrations" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id"      uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id"         text,
  "client_id"       text,
  "client_secret"   text,
  "access_token"    text,
  "token_expires_at" timestamp,
  "connected_by"    uuid REFERENCES "users"("id"),
  "last_synced_at"  timestamp,
  -- feature-flag: выключено по умолчанию; HR включает в Настройки → Интеграции
  "is_enabled"      boolean NOT NULL DEFAULT false,
  -- системный статус: false если токен отозван / интеграция сломана
  "is_active"       boolean NOT NULL DEFAULT true,
  "created_at"      timestamp DEFAULT now(),
  "updated_at"      timestamp DEFAULT now(),
  CONSTRAINT "avito_integrations_company_uniq" UNIQUE ("company_id")
);

CREATE INDEX IF NOT EXISTS "avito_integrations_company_idx"
  ON "avito_integrations" ("company_id");
