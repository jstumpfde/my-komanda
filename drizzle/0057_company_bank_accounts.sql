-- Банковские реквизиты компании (массив счетов)
-- Раньше хранились только в локальном state формы настроек и терялись при перезагрузке.

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_name TEXT,
  bik TEXT,
  rs TEXT,
  ks TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_company ON company_bank_accounts(company_id, sort_order);
