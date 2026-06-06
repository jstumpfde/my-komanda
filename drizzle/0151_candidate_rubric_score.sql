-- Рубричный движок соответствия (shadow): считается параллельно существующим
-- скорерам и НЕ влияет на автодействия. Для сравнения «старый vs новый».
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rubric_score integer;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rubric_details jsonb;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rubric_scored_at timestamp;
