-- Индексы под фильтры/сортировки на /hr/candidates.
-- idx_candidates_vacancy_id уже создан в 0080 — здесь не дублируем.

-- Часто фильтруют по этапу (Новые / На демо / Принят / Отказ).
CREATE INDEX IF NOT EXISTS "idx_candidates_stage"
  ON "candidates" ("stage");

-- Кнопка «Только избранные» — partial index, потому что 95%+ строк
-- имеют is_favorite=false и индекс по false-значениям бесполезен.
CREATE INDEX IF NOT EXISTS "idx_candidates_is_favorite"
  ON "candidates" ("is_favorite") WHERE "is_favorite" = true;

-- Сортировка по дате отклика по умолчанию + пагинация ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS "idx_candidates_created_at"
  ON "candidates" ("created_at" DESC);

-- Сортировка/фильтр по AI-скору. NULLS LAST — кандидаты без скора в конце.
CREATE INDEX IF NOT EXISTS "idx_candidates_ai_score"
  ON "candidates" ("ai_score" DESC NULLS LAST);
