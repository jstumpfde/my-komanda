-- Этап 3: корзина материалов библиотеки. Soft-delete для demo_templates.
-- Тип timestamp (без tz) — как vacancies.deleted_at, чтобы cron trash-cleanup
-- сравнивал одинаково (now() - make_interval(...)). Системные шаблоны
-- (is_system=true) в корзину не попадают (API запрещает их удаление).
ALTER TABLE demo_templates ADD COLUMN deleted_at timestamp;

-- Частичный индекс — выборка корзины (deleted_at IS NOT NULL) и cron-очистки.
CREATE INDEX idx_demo_templates_deleted_at ON demo_templates(deleted_at)
  WHERE deleted_at IS NOT NULL;
