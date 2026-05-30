-- Документооборот компании: бумажные оригиналы счетов, авто-счёт, задел под ЭДО.
-- Счета/акты по умолчанию шлются на companies.billing_email.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paper_invoices_required boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paper_invoice_address text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_invoice_enabled boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS edo_enabled boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS edo_provider text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS edo_operator_id text;
