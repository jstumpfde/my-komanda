-- Photo URL hh-кандидата (resume.photo). Берётся при импорте/backfill через
-- extractHhResumeFields, чтобы фронт не дёргал hh API на каждый рендер
-- карточки. Колонка nullable: для не-hh кандидатов или резюме без фото
-- остаётся NULL — UI рендерит инициалы.

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "photo_url" text;
