-- Block G: Pulse surveys + Flight Risk + Retention Actions
-- my-komanda migration 0008

-- ─── Pulse questions (system + tenant) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS pulse_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  category    TEXT DEFAULT 'engagement',
  is_system   BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0
);

-- 9 системных вопросов
INSERT INTO pulse_questions (text, category, is_system, sort_order) VALUES
  ('Насколько вы мотивированы на работе на этой неделе?', 'engagement', true, 1),
  ('Чувствуете ли вы поддержку от руководителя?', 'management', true, 2),
  ('Удаётся ли вам соблюдать баланс работы и личной жизни?', 'wellbeing', true, 3),
  ('Насколько комфортно вам работать в вашей команде?', 'team', true, 4),
  ('Видите ли вы возможности для профессионального роста?', 'growth', true, 5),
  ('Насколько вы удовлетворены текущими задачами?', 'satisfaction', true, 6),
  ('Считаете ли вы, что ваша работа оценивается справедливо?', 'compensation', true, 7),
  ('Насколько понятны вам цели и задачи вашей работы?', 'communication', true, 8),
  ('Рекомендовали бы вы компанию как место работы (eNPS)?', 'culture', true, 9)
ON CONFLICT DO NOTHING;

-- ─── Pulse surveys ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pulse_surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title           TEXT,
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  closes_at       TIMESTAMPTZ,
  status          TEXT DEFAULT 'draft',
  channel         TEXT DEFAULT 'telegram',
  question_ids    JSONB,
  response_count  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── Pulse responses ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pulse_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID NOT NULL REFERENCES pulse_surveys(id) ON DELETE CASCADE,
  employee_id  TEXT NOT NULL,
  question_id  UUID NOT NULL REFERENCES pulse_questions(id),
  score        INTEGER,
  open_text    TEXT,
  is_anonymous BOOLEAN DEFAULT true,
  responded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(survey_id, employee_id, question_id)
);

-- ─── Flight Risk scores ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flight_risk_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL,
  employee_name   TEXT,
  department      TEXT,
  position        TEXT,
  score           INTEGER NOT NULL DEFAULT 0,
  risk_level      TEXT DEFAULT 'low',
  factors         JSONB,
  previous_score  INTEGER,
  trend           TEXT DEFAULT 'stable',
  calculated_at   TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id)
);

-- ─── Flight Risk factors (reference data) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS flight_risk_factors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  weight      INTEGER DEFAULT 1,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

-- 27 факторов
INSERT INTO flight_risk_factors (slug, name, category, weight, description) VALUES
  -- Tenure (стаж)
  ('tenure_short',        'Стаж < 6 месяцев',            'tenure', 3, 'Новые сотрудники чаще уходят в первые полгода'),
  ('tenure_cliff',        'Стаж 1-2 года (кризис)',       'tenure', 4, 'Типичный период переоценки позиции'),
  ('no_promotion',        'Нет повышения > 2 лет',        'tenure', 5, 'Стагнация карьеры'),
  -- Engagement (вовлечённость)
  ('low_activity',        'Низкая активность',            'engagement', 4, 'Мало завершённых задач за период'),
  ('declining_activity',  'Падение активности',           'engagement', 5, 'Активность снижается 3+ недели'),
  ('no_initiative',       'Нет инициатив',                'engagement', 3, 'Не предлагает идеи и улучшения'),
  ('absenteeism',         'Частые отсутствия',            'engagement', 4, 'Больничные и отгулы выше нормы'),
  -- Pulse (пульс-опросы)
  ('low_pulse_score',     'Низкий пульс-балл',           'pulse', 5, 'Средний балл пульс-опроса < 3'),
  ('pulse_declining',     'Падающий пульс',              'pulse', 6, 'Балл падает 2+ недели подряд'),
  ('negative_feedback',   'Негативная обратная связь',   'pulse', 4, 'Критические комментарии в открытых ответах'),
  ('low_enps',            'Низкий eNPS',                  'pulse', 5, 'Оценка eNPS 0-6 (детрактор)'),
  -- Performance (производительность)
  ('low_assessment',      'Низкая оценка',               'performance', 4, 'Оценка навыков < 3 из 5'),
  ('skills_gap',          'Большой разрыв навыков',      'performance', 3, 'Skills gap > 2 баллов'),
  ('no_training',         'Нет обучения > 3 мес',        'performance', 3, 'Не проходил курсы'),
  ('failed_probation',    'Проблемы на испытательном',   'performance', 5, 'Адаптация < 50% за срок'),
  -- Organizational (организационные)
  ('manager_changed',     'Смена руководителя',           'organizational', 4, 'Новый руководитель за последние 3 мес'),
  ('team_restructure',    'Реструктуризация отдела',     'organizational', 3, 'Изменения в оргструктуре'),
  ('peers_leaving',       'Коллеги уходят',              'organizational', 5, 'Увольнения в команде за 3 мес'),
  ('high_workload',       'Высокая нагрузка',            'organizational', 4, 'Переработки > 10% от нормы'),
  ('role_mismatch',       'Несоответствие роли',          'organizational', 4, 'Задачи не соответствуют ожиданиям'),
  -- Compensation (компенсация)
  ('below_market',        'Зарплата ниже рынка',          'compensation', 5, 'Ниже медианы по позиции'),
  ('no_salary_review',    'Нет пересмотра > 1 год',      'compensation', 4, 'Зарплата не пересматривалась'),
  ('bonus_missed',        'Не получил бонус',             'compensation', 3, 'Не получил ожидаемый бонус'),
  -- Development (развитие)
  ('no_career_plan',      'Нет плана развития',           'development', 3, 'Не определён карьерный путь'),
  ('no_mentoring',        'Нет наставника',               'development', 2, 'Не назначен buddy/ментор'),
  ('certification_expired','Сертификация истекла',         'development', 2, 'Устаревшие сертификаты'),
  ('bored_skilled',       'Перерос позицию',              'development', 5, 'Навыки значительно превышают требования')
ON CONFLICT (slug) DO NOTHING;

-- ─── Retention actions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS retention_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  type         TEXT DEFAULT 'conversation',
  status       TEXT DEFAULT 'planned',
  priority     TEXT DEFAULT 'medium',
  assigned_to  UUID REFERENCES users(id),
  due_date     TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome      TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pulse_responses_survey ON pulse_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_pulse_responses_employee ON pulse_responses(employee_id);
CREATE INDEX IF NOT EXISTS idx_flight_risk_tenant ON flight_risk_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flight_risk_level ON flight_risk_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_retention_actions_tenant ON retention_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retention_actions_status ON retention_actions(status);

-- Grants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
