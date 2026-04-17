-- Назначение сотрудника на должность
ALTER TABLE positions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
