-- Композитный индекс (vacancy_id, created_at DESC) — оптимизация для
-- основного запроса страницы кандидатов вакансии:
--   SELECT ... FROM candidates WHERE vacancy_id = ? ORDER BY created_at DESC LIMIT N
--
-- До: Planner использовал idx_candidates_created_at (только по дате) и
-- после читал все строки в дате-порядке, фильтруя по vacancy_id. На больших
-- компаниях с 10к+ кандидатов это давало ситуацию когда для вакансии с
-- редкими откликами надо было прочитать тысячи чужих строк.
--
-- После: Index Cond сразу отрезает только нужную вакансию, ORDER BY уже
-- удовлетворён ASC/DESC-ключом индекса.
CREATE INDEX IF NOT EXISTS idx_candidates_vacancy_created
  ON candidates (vacancy_id, created_at DESC);
