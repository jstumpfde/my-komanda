-- Партнёрская программа (этап 0). Расширяем существующие integrator* таблицы.
-- Роли: партнёр / суб-партнёр / реферал (внешние, с комиссией) + аккаунт-менеджер
-- (наш сотрудник = platform_manager, без комиссии — отдельная роль не нужна).

-- integrators: тип партнёра, иерархия (суб-партнёр), фикс-% на партнёра, режим биллинга.
ALTER TABLE integrators ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'partner';
  -- 'partner' | 'sub_partner' | 'referral'
ALTER TABLE integrators ADD COLUMN IF NOT EXISTS parent_integrator_id uuid REFERENCES integrators(id) ON DELETE SET NULL;
  -- старший партнёр для суб-партнёра (двухуровневая иерархия)
ALTER TABLE integrators ADD COLUMN IF NOT EXISTS commission_percent text;
  -- фикс-% именно этого партнёра (override уровня); NULL → берём из integrator_levels
ALTER TABLE integrators ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'platform';
  -- 'platform' (мы биллим клиента, партнёру начисляем %) | 'partner' (партнёр сам биллит, платит нам нетто)

-- integrator_clients: кто завёл клиента + статус онбординга.
ALTER TABLE integrator_clients ADD COLUMN IF NOT EXISTS onboarded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE integrator_clients ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
  -- 'onboarding' | 'active' | 'cancelled'
