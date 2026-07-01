-- Пер-блочный скоринг анкеты (Вариант Б): балл каждого контент-блока (демо) отдельно.
-- Ключ = demos.id. { [demoId]: { title, score, breakdown:[{questionText,awarded,max,comment}] } }.
-- demoAnswersScore остаётся = балл первого/основного блока (обратная совместимость).
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS demo_block_scores jsonb;
