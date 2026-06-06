-- Адрес для оригиналов счетов — отдельные ячейки (индекс/город/получатель).
-- paper_invoice_address остаётся под улицу/дом/офис.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paper_invoice_index text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paper_invoice_city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paper_invoice_recipient text;
