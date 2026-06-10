-- Аудит 10.06.2026, пакет 3: индексы под горячие запросы.
--
-- 1) hh_responses(company_id, status) — process-queue и scan-incoming фильтруют
--    отклики компании по статусу; существующие индексы покрывают только
--    company_id отдельно (0032) и partial по status='response' (0118).
-- 2) vacancies(company_id, deleted_at) — табы Активные/Архив/Корзина и
--    cron trash-cleanup отбирают вакансии компании по deleted_at.
-- 3) demos(vacancy_id, kind) — создан в 0142 БЕЗ IF NOT EXISTS; дублируем
--    идемпотентно на случай, если 0142 на каком-то окружении не применялась.

CREATE INDEX IF NOT EXISTS idx_hh_responses_company_status
  ON hh_responses (company_id, status);

CREATE INDEX IF NOT EXISTS idx_vacancies_company_deleted_at
  ON vacancies (company_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_demos_vacancy_kind
  ON demos (vacancy_id, kind);
