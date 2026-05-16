-- subscription_history: привести в соответствие со schema (lib/db/schema.ts).
-- В БД были старые status/started_at/expires_at/cancelled_at/reason, в schema
-- ожидаются event/details. На каждом invoice-create мы пытались записать
-- event/details и валились на NOT NULL status — invoice уже создан, но
-- роут отдавал 500 → пользователь видел «Ошибка создания счёта», хотя
-- счёт в БД появлялся.

-- 1) Добавляем недостающие колонки
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS event   TEXT;
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS details JSONB;

-- 2) Бэкфилл event из status (если есть данные) и снимаем NOT NULL со старых
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='subscription_history' AND column_name='status') THEN
    UPDATE subscription_history SET event = status WHERE event IS NULL;
    ALTER TABLE subscription_history ALTER COLUMN status DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='subscription_history' AND column_name='started_at') THEN
    ALTER TABLE subscription_history ALTER COLUMN started_at DROP NOT NULL;
  END IF;
END$$;

-- 3) event теперь NOT NULL по контракту schema
UPDATE subscription_history SET event = 'unknown' WHERE event IS NULL;
ALTER TABLE subscription_history ALTER COLUMN event SET NOT NULL;
