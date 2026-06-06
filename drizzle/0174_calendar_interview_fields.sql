-- Интервью-модуль на реальных данных: события календаря type='interview' получают
-- структуру (кандидат/вакансия/интервьюер/тип/формат). Всё nullable — обычные
-- события (meeting/training/…) их не используют. Связь с кандидатом/вакансией —
-- set null при удалении, чтобы не блокировать каскады.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS candidate_id      uuid REFERENCES candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vacancy_id        uuid REFERENCES vacancies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interviewer       text,
  ADD COLUMN IF NOT EXISTS interview_type    text,   -- 'Техническое' | 'HR' | 'Финальное'
  ADD COLUMN IF NOT EXISTS interview_format  text;   -- 'Онлайн' | 'Офис'
