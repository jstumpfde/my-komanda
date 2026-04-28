-- v4: короткие идентификаторы вакансий и кандидатов
--   vacancies.short_code   = "YYMMVNNN"      (например, 2604V001)
--   candidates.short_id    = "YYMMVNNNCCCC"  (например, 2604V0010042)
--   candidates.sequence_number — порядковый номер кандидата в рамках вакансии (0 = preview).

-- 1. Добавить колонки (без UNIQUE — добавим после бэкфилла, чтобы не было гонок).
ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS short_code TEXT;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS short_id TEXT,
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER;

-- 2. Бэкфилл short_code для вакансий: YYMM(created_at) + 'V' + порядковый внутри YYMM.
WITH vacancy_numbered AS (
  SELECT id,
         to_char(COALESCE(created_at, now()), 'YYMM') AS yymm,
         row_number() OVER (
           PARTITION BY to_char(COALESCE(created_at, now()), 'YYMM')
           ORDER BY created_at NULLS LAST, id
         ) AS seq
  FROM vacancies
  WHERE short_code IS NULL
)
UPDATE vacancies v
SET short_code = vn.yymm || 'V' || LPAD(vn.seq::text, 3, '0')
FROM vacancy_numbered vn
WHERE v.id = vn.id;

-- 3. Бэкфилл short_id для непревью-кандидатов: short_code + LPAD(seq, 4).
WITH candidate_numbered AS (
  SELECT c.id,
         v.short_code AS vacancy_code,
         row_number() OVER (
           PARTITION BY c.vacancy_id
           ORDER BY c.created_at NULLS LAST, c.id
         ) AS seq
  FROM candidates c
  JOIN vacancies v ON v.id = c.vacancy_id
  WHERE c.short_id IS NULL
    AND (c.source IS NULL OR c.source <> 'preview')
)
UPDATE candidates c
SET short_id = cn.vacancy_code || LPAD(cn.seq::text, 4, '0'),
    sequence_number = cn.seq
FROM candidate_numbered cn
WHERE c.id = cn.id;

-- 4. Бэкфилл preview-кандидатов — sequence_number = 0, short_id оканчивается на 0000.
--    Если у одной вакансии несколько preview-кандидатов (исторически такое бывает),
--    оставляем 0000 только у самого старого; остальные продолжают жить без short_id
--    (они скрыты от UI и обращаются по token).
WITH preview_first AS (
  SELECT DISTINCT ON (c.vacancy_id)
         c.id, v.short_code AS vacancy_code
  FROM candidates c
  JOIN vacancies v ON v.id = c.vacancy_id
  WHERE c.source = 'preview' AND c.short_id IS NULL
  ORDER BY c.vacancy_id, c.created_at NULLS LAST, c.id
)
UPDATE candidates c
SET short_id = pf.vacancy_code || '0000',
    sequence_number = 0
FROM preview_first pf
WHERE c.id = pf.id;

-- 5. Уникальные ограничения и индексы (идемпотентно).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vacancies_short_code_unique'
  ) THEN
    ALTER TABLE vacancies
      ADD CONSTRAINT vacancies_short_code_unique UNIQUE (short_code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidates_short_id_unique'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_short_id_unique UNIQUE (short_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vacancies_short_code ON vacancies(short_code);
CREATE INDEX IF NOT EXISTS idx_candidates_short_id  ON candidates(short_id);
