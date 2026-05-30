-- Дата конца оплаченного периода. Выставляется при оплате счёта (= periodEnd).
-- По ней: отсчёт для платных тарифов (плашка) и авто-счёт на продление (cron).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_period_end timestamp;
