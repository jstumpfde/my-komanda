-- O4 (28.06): индекс vacancies(company_id) — ускоряет company-фильтр во ВСЕХ
-- запросах отчёта по найму (build-report.ts join candidates→vacancies).
-- candidates уже проиндексированы (vacancy_id, stage, vacancy_id+created).
-- CONCURRENTLY — без блокировки записи на живом проде (не в транзакции!).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vacancies_company_id
  ON vacancies (company_id);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
