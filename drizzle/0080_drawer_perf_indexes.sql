-- Индексы под горячий путь Drawer карточки кандидата:
-- GET /api/modules/hr/candidates/[id] делает JOIN candidates → vacancies →
-- hh_responses (по local_candidate_id + company_id). Без индекса на
-- hh_responses(local_candidate_id, company_id) этот JOIN сканирует таблицу
-- целиком — основная причина ~1.9с на запрос.

CREATE INDEX IF NOT EXISTS "idx_hh_responses_local_candidate_company"
  ON "hh_responses" ("local_candidate_id", "company_id");

-- Fallback-путь: hh_candidates(candidate_id) ищется когда основной JOIN
-- не нашёл связку. На холодных импортах эта таблица большая.
CREATE INDEX IF NOT EXISTS "idx_hh_candidates_candidate_id"
  ON "hh_candidates" ("candidate_id");

-- candidates(vacancy_id) используется в листингах и фильтрах. PK на id есть,
-- индекса по vacancy_id раньше не было.
CREATE INDEX IF NOT EXISTS "idx_candidates_vacancy_id"
  ON "candidates" ("vacancy_id");

-- demos(vacancy_id) — для подзапроса latest demo lessons.
CREATE INDEX IF NOT EXISTS "idx_demos_vacancy_id"
  ON "demos" ("vacancy_id");
