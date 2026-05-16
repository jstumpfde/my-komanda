-- Единый стандарт воронки кандидатов: 9 стадий
-- (new/primary_contact/demo_opened/anketa_filled/ai_screening/decision/
--  interview/hired/rejected).
--
-- 1) Удаляет legacy-стадии (demo/scheduled/interviewed) — кандидаты с этими
--    stage-значениями уже мигрированы на новые в process-queue и т.д.;
--    тут только чистим funnel_stages-конфиг, на котором завязан UI.
-- 2) Идемпотентно досеивает 9 стандартных для ВСЕХ company_id, у которых
--    хотя бы одна стадия отсутствует. WHERE NOT EXISTS защищает от дублей.
--
-- Запустить на проде вручную через sudo -u postgres (mykomanda не owner).

-- ── 1) Удаляем legacy slug'и ────────────────────────────────────────────────
DELETE FROM funnel_stages WHERE slug IN ('demo', 'scheduled', 'interviewed');

-- ── 2) Бэкфил: для каждой company × стандартный slug — INSERT IF NOT EXISTS
INSERT INTO funnel_stages (id, company_id, slug, title, color, sort_order, is_terminal, is_default, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.id,
  t.slug,
  t.title,
  t.color,
  t.sort_order,
  t.is_terminal,
  t.is_default,
  NOW(),
  NOW()
FROM companies c
CROSS JOIN (VALUES
  ('new',             'Новый',             '#94a3b8', 0, false, true),
  ('primary_contact', 'Первичный контакт', '#60a5fa', 1, false, false),
  ('demo_opened',     'Демо открыто',      '#6366f1', 2, false, false),
  ('anketa_filled',   'Анкета заполнена',  '#fb923c', 3, false, false),
  ('ai_screening',    'AI-скрининг',       '#06b6d4', 4, false, false),
  ('decision',        'Демо пройдено',     '#f59e0b', 5, false, false),
  ('interview',       'Собеседование',     '#8b5cf6', 6, false, false),
  ('hired',           'Нанят',             '#22c55e', 7, true,  false),
  ('rejected',        'Отказ',             '#ef4444', 8, true,  false)
) AS t(slug, title, color, sort_order, is_terminal, is_default)
WHERE NOT EXISTS (
  SELECT 1 FROM funnel_stages fs
  WHERE fs.company_id = c.id AND fs.slug = t.slug
);
