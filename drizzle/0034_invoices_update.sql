-- Rename number → invoice_number
ALTER TABLE invoices RENAME COLUMN number TO invoice_number;

-- Add new columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_start TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_end TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_inn TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_kpp TEXT;

-- Rename pdf_url → pdf_path
ALTER TABLE invoices RENAME COLUMN pdf_url TO pdf_path;

-- Update status default from 'draft' to 'pending', make NOT NULL
ALTER TABLE invoices ALTER COLUMN status SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'pending';

-- Add ON DELETE CASCADE to company_id
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_company_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Update created_at to have timezone
ALTER TABLE invoices ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
