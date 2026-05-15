-- Привести таблицу invoices в соответствие со schema (lib/db/schema.ts).
-- Объединяет недоприменённую 0034 + добавляет amount.
-- Идемпотентно: IF NOT EXISTS / IF EXISTS на каждом шаге.

-- 1) number → invoice_number (если ещё не переименовано)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'invoices' AND column_name = 'number')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'invoices' AND column_name = 'invoice_number') THEN
    ALTER TABLE invoices RENAME COLUMN number TO invoice_number;
  END IF;
END$$;

-- 2) Новые колонки (период, реквизиты, сумма-копии)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount        INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_start  DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_end    DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_name    TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_inn     TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_kpp     TEXT;

-- 3) pdf_url → pdf_path
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'invoices' AND column_name = 'pdf_url')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'invoices' AND column_name = 'pdf_path') THEN
    ALTER TABLE invoices RENAME COLUMN pdf_url TO pdf_path;
  END IF;
END$$;

-- 4) status NOT NULL + default 'pending' (если ещё не nullable->notnull)
UPDATE invoices SET status = COALESCE(status, 'pending');
ALTER TABLE invoices ALTER COLUMN status SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'pending';
