-- Индекс на birth_date — после backfill'а 463 кандидатов фильтр по возрасту
-- начнёт реально использоваться, и без индекса будет seq scan по таблице.
CREATE INDEX IF NOT EXISTS "idx_candidates_birth_date" ON "candidates"("birth_date");

-- Индекс на experience_years — для фильтра «опыт от/до».
CREATE INDEX IF NOT EXISTS "idx_candidates_experience_years" ON "candidates"("experience_years");

-- Индекс на city — фильтр по городу часто используется в списках кандидатов.
CREATE INDEX IF NOT EXISTS "idx_candidates_city" ON "candidates"("city");
