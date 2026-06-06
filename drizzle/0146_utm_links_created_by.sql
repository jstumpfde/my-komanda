-- Источники: audit-колонка «кто создал ссылку».
-- nullable — старые 8 строк остаются NULL, это норм (исторические данные).
-- В POST /api/modules/hr/vacancies/[id]/utm-links теперь пишется
-- user.id из requireCompany() при insert. Параллельно дублируется в
-- activity_log (entity_type='utm_link'), но колонка нужна для прямой
-- ссылки без JOIN'а с логом и для отчётов.
-- FK не ставим: при удалении пользователя ссылку терять не хотим,
-- а ON DELETE SET NULL и так получится через NULL-инициализацию старых
-- строк; для нового аудита будет user.id, который не удаляется.
ALTER TABLE vacancy_utm_links
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
