-- Password reset tokens — для восстановления пароля через email.
-- Сам токен (hex 32 байта) отправляется пользователю в ссылке,
-- в БД хранится только SHA-256-хеш. TTL — 1 час.

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash"  text NOT NULL UNIQUE,
  "expires_at"  timestamp NOT NULL,
  "used_at"     timestamp,
  "ip_address"  text,
  "user_agent"  text,
  "created_at"  timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_token_hash"
  ON "password_reset_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_expires_at"
  ON "password_reset_tokens" ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user_id"
  ON "password_reset_tokens" ("user_id");
