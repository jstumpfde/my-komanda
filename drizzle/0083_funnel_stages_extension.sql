-- 0083_funnel_stages_extension.sql
-- Расширение воронки кандидатов: добавляем стейджи primary_contact,
-- demo_opened, anketa_filled между существующими new и hired.
--
-- Изменения:
--   1. Новая колонка candidates.demo_opened_at — фиксирует момент,
--      когда кандидат-владелец впервые открыл свою страницу /demo/<shortId>.
--   2. Идемпотентная миграция данных: stage='demo' разделяем по
--      наличию demo_progress_json:
--        - demo_progress_json IS NULL → primary_contact (приглашение
--          отправили, но кандидат не открывал)
--        - demo_progress_json IS NOT NULL и completedAt IS NULL → demo_opened
--          (открыл и/или начал отвечать, но не дошёл до конца)
--        - completedAt IS NOT NULL → остаётся 'demo' (исторические данные,
--          скорее всего давно перешли в decision)
--   3. Ключ 'decision' остаётся как есть; в UI лейбл переименовывается
--      на «Демо пройдено», но БД не трогаем.
--   4. Новый ключ 'anketa_filled' будет выставляться кодом
--      приёма анкеты (см. apply/route.ts), миграция данных не нужна.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS demo_opened_at TIMESTAMP;

-- Маппинг старых stage='demo' по наличию прогресса демо.
UPDATE candidates
   SET stage = 'primary_contact'
 WHERE stage = 'demo'
   AND demo_progress_json IS NULL;

UPDATE candidates
   SET stage = 'demo_opened',
       demo_opened_at = COALESCE(demo_opened_at, updated_at, created_at)
 WHERE stage = 'demo'
   AND demo_progress_json IS NOT NULL
   AND (demo_progress_json->>'completedAt') IS NULL;

-- Индекс на новую колонку (используется в фильтрах списка кандидатов).
CREATE INDEX IF NOT EXISTS idx_candidates_demo_opened_at
  ON candidates (demo_opened_at)
  WHERE demo_opened_at IS NOT NULL;
