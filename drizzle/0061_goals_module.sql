-- Goals (Координатор Целей) — годовые / месячные / недельные цели пользователя.
-- Прогресс обновляется вручную, без интеграции с модулями (см. ТЗ, Фаза 2).
-- Используется на /goals и /morning-brief.

CREATE TABLE IF NOT EXISTS goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id      UUID REFERENCES goals(id) ON DELETE CASCADE,
  level          VARCHAR(20) NOT NULL CHECK (level IN ('yearly', 'monthly', 'weekly')),
  title          TEXT NOT NULL,
  description    TEXT,
  target_value   NUMERIC,
  target_unit    VARCHAR(50),
  current_value  NUMERIC DEFAULT 0,
  deadline       DATE,
  is_focus_today BOOLEAN DEFAULT FALSE,
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id       ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent_id     ON goals(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_level    ON goals(user_id, level);
CREATE INDEX IF NOT EXISTS idx_goals_user_focus    ON goals(user_id, is_focus_today) WHERE is_focus_today = TRUE;
