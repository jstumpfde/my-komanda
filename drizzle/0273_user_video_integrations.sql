-- Личные видео-интеграции менеджера (Zoom, позже Яндекс.Телемост) — Юрий 10.07.
CREATE TABLE IF NOT EXISTS user_video_integrations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                text NOT NULL,
  external_account_email  text,
  access_token            text NOT NULL,
  refresh_token           text,
  token_expires_at        timestamptz,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);
