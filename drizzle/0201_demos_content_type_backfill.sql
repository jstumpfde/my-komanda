-- Миграция 0201: мягкий бэкфилл content_type для блоков конструктора контента.
-- Блоки kind='block:<uuid>' с content_type='presentation' и title ILIKE '%тест%'
-- (регистронезависимо) помечаются как 'test' — это пользовательское соглашение.
-- Идемпотентна: повторный запуск ничего не меняет.

UPDATE demos
SET content_type = 'test'
WHERE kind LIKE 'block:%'
  AND content_type = 'presentation'
  AND lower(title) LIKE '%тест%';
