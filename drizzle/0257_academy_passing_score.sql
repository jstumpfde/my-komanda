-- Академия продукта: минимальная доработка LMS-движка (courses/lessons) —
-- порог сдачи итогового теста по баллам. См. docs/architecture (Академия).
--
-- courses.passing_score_percent — порог сдачи (0-100), null = без порога
-- (legacy-курсы без квизов завершаются как раньше, по факту прохождения
-- всех уроков — байт-в-байт, ничего не ломаем).
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS passing_score_percent integer;

-- course_enrollments.quiz_score_percent — средний % по quiz-урокам курса,
-- пересчитывается при каждом complete-lesson. null пока ни один квиз не пройден.
ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS quiz_score_percent integer;
