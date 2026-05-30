-- Platform-level key/value settings (singleton-ish KV).
-- Первое применение: срок авто-удаления единой Корзины /admin/clients
-- (компании/пользователи/счета), ключ 'trash_retention_days', дефолт 7.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value)
VALUES ('trash_retention_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;
