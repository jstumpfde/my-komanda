-- 0160: кастомный текст отложенного отказа.
-- Заход 3 (отложенные отказы): стоп-факторы шлют свой текст по каждому фактору
-- (rejectionText), а cron-исполнитель раньше брал только generic rejectMessage
-- вакансии. Эта колонка сохраняет уже отрендеренный текст на момент планирования,
-- чтобы при исполнении отказа кандидат получил именно факторный текст.
--
-- NULL = использовать generic rejectMessage вакансии (как прежде).
-- Идемпотентно: ADD COLUMN IF NOT EXISTS.

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pending_rejection_message text;
