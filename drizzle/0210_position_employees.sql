-- Вариант B: много сотрудников на одну должность (org-схема).
CREATE TABLE IF NOT EXISTS position_employees (
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamp DEFAULT now(),
  CONSTRAINT position_employees_pos_user_uniq UNIQUE (position_id, user_id)
);

-- Бэкфилл: существующие одиночные сотрудники (positions.user_id) → связи.
INSERT INTO position_employees (position_id, user_id)
SELECT id, user_id FROM positions WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
