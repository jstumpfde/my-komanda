-- Миграция 0179: динамические блоки контента вакансии
-- Добавляем sort_order и content_type к таблице demos.
-- Новые динамические блоки имеют kind='block:<uuid>' — не конфликтуют
-- с рантайм-запросами kind='demo' и kind='test'.

ALTER TABLE demos ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'presentation';

-- Бэкфилл content_type из kind
UPDATE demos SET content_type = 'test' WHERE kind = 'test';
UPDATE demos SET content_type = 'presentation' WHERE kind = 'demo' OR kind NOT IN ('test');

-- Бэкфилл sort_order: нумерация по created_at в рамках каждой вакансии
UPDATE demos d
SET sort_order = sub.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY vacancy_id ORDER BY created_at) AS rn
  FROM demos
) sub
WHERE d.id = sub.id;
