-- 0218: ответственные менеджеры платформы + ставки комиссий.
-- Идемпотентно (IF NOT EXISTS / ON CONFLICT) — безопасно гонять повторно.

-- Менеджер продаж + клиентский менеджер у каждого клиента/партнёра (партнёр =
-- компания + integrator, поэтому поля на companies покрывают и клиентов, и партнёров).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS sales_manager_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS account_manager_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_sales_manager_id_idx   ON companies(sales_manager_id);
CREATE INDEX IF NOT EXISTS companies_account_manager_id_idx ON companies(account_manager_id);

-- Ставки комиссий менеджеров (одна строка на роль; всё настраивается из админки).
CREATE TABLE IF NOT EXISTS manager_commission_rates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role                  text NOT NULL UNIQUE,        -- 'sales_manager' | 'account_manager'
  sale_percent          text NOT NULL DEFAULT '0',   -- % при продаже
  accompaniment_percent text NOT NULL DEFAULT '0',   -- % сопровождения
  updated_at            timestamp DEFAULT now()
);

-- Дефолтные ставки (решение Юрия 17.06):
--   менеджер продаж: 10% при продаже + 5% сопровождение
--   клиентский менеджер: 5% сопровождение
INSERT INTO manager_commission_rates (role, sale_percent, accompaniment_percent) VALUES
  ('sales_manager',   '10', '5'),
  ('account_manager', '0',  '5')
ON CONFLICT (role) DO NOTHING;

-- Конвенция проекта: новые таблицы доступны приложению (роль mykomanda).
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
