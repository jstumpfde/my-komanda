-- Внешний человекочитаемый номер/реф-код партнёра (напр. "1101").
-- Идемпотентно: безопасно прогонять повторно.
ALTER TABLE integrators ADD COLUMN IF NOT EXISTS external_id text;

-- Уникальность номера среди заполненных (NULL не конфликтуют).
CREATE UNIQUE INDEX IF NOT EXISTS integrators_external_id_key
  ON integrators (external_id)
  WHERE external_id IS NOT NULL;
