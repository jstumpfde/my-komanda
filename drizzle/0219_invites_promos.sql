-- 0219: платформенные ссылки-приглашения + промокоды.
-- Идемпотентно (IF NOT EXISTS / ON CONFLICT) — безопасно гонять повторно.
--
-- NB: company-уровневая таблица invite_links (0009/0013) уже существует —
-- она хранит ссылки для HR-пользователей внутри компании (с company_id).
-- Здесь platform_invite_links — платформенный уровень (без company_id),
-- поддерживает партнёрские роли (kind), управляется из /admin/invites.

-- Платформенные ссылки-приглашения.
-- token — криптографический hex-16 (32 символа), уникален.
-- role — значение из CLIENT_ACCESS_TYPES или PARTNER_ACCESS_TYPES.
-- kind — для партнёрских приглашений: partner/sub_partner/referral/sub_referral.
-- max_uses = 0 → безлимитная ссылка.
CREATE TABLE IF NOT EXISTS platform_invite_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        UNIQUE NOT NULL,
  role        text        NOT NULL,
  kind        text        NULL,
  label       text,
  max_uses    int         NOT NULL DEFAULT 0,
  used_count  int         NOT NULL DEFAULT 0,
  expires_at  timestamp   NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_invite_links_token_idx ON platform_invite_links(token);

-- Промокоды (platform_promo_codes; имя НЕ promo_codes — в БД уже есть orphan-
-- таблица promo_codes с другими колонками discount_percent/description, без схемы).
-- kind: 'discount_percent' | 'trial_days' | 'plan'
-- value: строка (например "20" для скидки 20%, "14" для 14 дней триала,
--        slug тарифа для 'plan').
-- max_uses = 0 → безлимитный.
CREATE TABLE IF NOT EXISTS platform_promo_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        UNIQUE NOT NULL,
  kind        text        NOT NULL,
  value       text        NOT NULL,
  max_uses    int         NOT NULL DEFAULT 0,
  used_count  int         NOT NULL DEFAULT 0,
  expires_at  timestamp   NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_promo_codes_code_idx ON platform_promo_codes(code);

-- Конвенция проекта: новые таблицы доступны приложению (роль mykomanda).
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
