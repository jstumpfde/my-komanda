-- Балл по ответам демо — отдельная колонка, чтобы не было гонки с ai_score
-- (туда пишут и v1/v2-скоринг резюме, и скорер ответов; колонка «AI-ан»
-- показывала бы то одно, то другое). Скорер lib/demo/score-answers.ts пишет сюда.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS demo_answers_score integer,
  ADD COLUMN IF NOT EXISTS demo_answers_details jsonb;
