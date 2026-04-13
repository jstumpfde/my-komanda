-- ============================================================================
-- Seed: CRM-сделки + Бронирование (демо-данные)
-- Запуск: psql $DATABASE_URL -f scripts/seed-demo-crm-booking.sql
-- ============================================================================
-- ВАЖНО: замени :TENANT_ID на реальный UUID компании перед запуском
-- Чтобы найти: SELECT id, name FROM companies LIMIT 10;
-- ============================================================================

BEGIN;

-- ── Переменная tenant ────────────────────────────────────────────────────────
-- Подставь свой UUID компании:
DO $$
DECLARE
  tid uuid;
BEGIN
  -- Берём первую компанию, или подставь конкретный UUID
  SELECT id INTO tid FROM companies ORDER BY created_at LIMIT 1;
  IF tid IS NULL THEN
    RAISE EXCEPTION 'Нет компаний в базе — сначала создай компанию';
  END IF;
  RAISE NOTICE 'Tenant ID: %', tid;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. CRM — Сделки (sales_deals)
  -- ══════════════════════════════════════════════════════════════════════════
  -- amount в копейках (50 000 ₽ = 5000000)

  INSERT INTO sales_deals (id, tenant_id, title, amount, currency, stage, priority, probability, source, description, expected_close_date, created_at, updated_at)
  VALUES
    -- Новые
    (gen_random_uuid(), tid,
     'Внедрение CRM для Альфа-Строй',
     15000000, 'RUB', 'new', 'high', 10,
     'Сайт', 'Крупный застройщик, 200+ сотрудников. Нужна полная автоматизация продаж.',
     NOW() + interval '30 days',
     NOW() - interval '2 days', NOW() - interval '2 days'),

    (gen_random_uuid(), tid,
     'Подписка HR-модуль — Сеть кофеен "Бодрое утро"',
     7500000, 'RUB', 'new', 'medium', 10,
     'Реферал', 'Сеть из 12 точек, ищут ATS для массового найма бариста.',
     NOW() + interval '21 days',
     NOW() - interval '1 day', NOW() - interval '1 day'),

    -- Квалификация
    (gen_random_uuid(), tid,
     'Обучение команды Логистик-Про',
     12000000, 'RUB', 'qualifying', 'medium', 20,
     'Выставка', 'Познакомились на TransRussia. Нужно обучение 40 менеджеров.',
     NOW() + interval '45 days',
     NOW() - interval '8 days', NOW() - interval '5 days'),

    (gen_random_uuid(), tid,
     'Лицензия Business — Агентство "Медиа Фокус"',
     5990000, 'RUB', 'qualifying', 'low', 20,
     'Соцсети', 'Рекламное агентство, 30 человек. Интересует маркетинг-модуль.',
     NOW() + interval '14 days',
     NOW() - interval '10 days', NOW() - interval '7 days'),

    -- Предложение
    (gen_random_uuid(), tid,
     'HR-автоматизация МедЦентр "Здоровье"',
     25000000, 'RUB', 'proposal', 'high', 40,
     'Звонок', 'Сеть клиник, 500 сотрудников. КП отправлено, ждём решения совета.',
     NOW() + interval '20 days',
     NOW() - interval '15 days', NOW() - interval '3 days'),

    -- Переговоры
    (gen_random_uuid(), tid,
     'Годовой контракт — Производство "ТехноПак"',
     50000000, 'RUB', 'negotiation', 'high', 60,
     'Email', 'Согласовали объём, обсуждаем скидку за годовую оплату.',
     NOW() + interval '10 days',
     NOW() - interval '22 days', NOW() - interval '1 day'),

    (gen_random_uuid(), tid,
     'Пилотный проект — Банк "Развитие"',
     35000000, 'RUB', 'negotiation', 'medium', 60,
     'Звонок', 'Пилот на 3 месяца для HR-отдела (80 чел). Юристы согласуют договор.',
     NOW() + interval '7 days',
     NOW() - interval '25 days', NOW() - interval '2 days'),

    -- Закрыта — выиграна
    (gen_random_uuid(), tid,
     'Внедрение Склад + Логистика — ООО "ФрешМаркет"',
     18000000, 'RUB', 'won', 'high', 100,
     'Реферал', 'Сеть продуктовых магазинов. Подписали на год.',
     NOW() - interval '3 days',
     NOW() - interval '28 days', NOW() - interval '3 days'),

    -- Закрыта — проиграна
    (gen_random_uuid(), tid,
     'CRM для "Стиль Интерьер"',
     8500000, 'RUB', 'lost', 'low', 0,
     'Сайт', 'Дизайн-студия, выбрали конкурента из-за интеграции с AutoCAD.',
     NOW() - interval '5 days',
     NOW() - interval '20 days', NOW() - interval '5 days'),

    (gen_random_uuid(), tid,
     'Подписка Solo — ИП Козлова (бухгалтерия)',
     1490000, 'RUB', 'lost', 'low', 0,
     'Сайт', 'Слишком маленький объём, решили вести в Excel.',
     NOW() - interval '7 days',
     NOW() - interval '14 days', NOW() - interval '7 days');

  RAISE NOTICE 'Inserted 10 sales_deals';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. Бронирование — Услуги (booking_services)
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO booking_services (id, tenant_id, name, description, duration, price, currency, color, is_active, sort_order, created_at, updated_at)
  VALUES
    ('a0000000-0000-0000-0000-000000000001'::uuid, tid,
     'Консультация по внедрению', 'Первичная консультация по автоматизации бизнес-процессов',
     60, 500000, 'RUB', '#3B82F6', true, 1, NOW(), NOW()),

    ('a0000000-0000-0000-0000-000000000002'::uuid, tid,
     'Демонстрация платформы', 'Персональная демо-сессия с разбором кейса клиента',
     45, 0, 'RUB', '#10B981', true, 2, NOW(), NOW()),

    ('a0000000-0000-0000-0000-000000000003'::uuid, tid,
     'Настройка и обучение', 'Настройка модулей под процессы компании + обучение команды',
     120, 1500000, 'RUB', '#8B5CF6', true, 3, NOW(), NOW()),

    ('a0000000-0000-0000-0000-000000000004'::uuid, tid,
     'Аудит HR-процессов', 'Комплексный аудит текущих HR-процессов с рекомендациями',
     90, 1000000, 'RUB', '#F59E0B', true, 4, NOW(), NOW());

  RAISE NOTICE 'Inserted 4 booking_services';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. Бронирование — Ресурсы/специалисты (booking_resources)
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO booking_resources (id, tenant_id, name, type, description, is_active, schedule, breaks, created_at, updated_at)
  VALUES
    ('b0000000-0000-0000-0000-000000000001'::uuid, tid,
     'Елена Смирнова', 'specialist', 'Старший консультант по внедрению',
     true,
     '{"mon":{"start":"09:00","end":"18:00","active":true},"tue":{"start":"09:00","end":"18:00","active":true},"wed":{"start":"09:00","end":"18:00","active":true},"thu":{"start":"09:00","end":"18:00","active":true},"fri":{"start":"09:00","end":"17:00","active":true},"sat":{"active":false},"sun":{"active":false}}'::jsonb,
     '[{"start":"13:00","end":"14:00"}]'::jsonb,
     NOW(), NOW()),

    ('b0000000-0000-0000-0000-000000000002'::uuid, tid,
     'Дмитрий Волков', 'specialist', 'HR-эксперт, аудит и автоматизация',
     true,
     '{"mon":{"start":"10:00","end":"19:00","active":true},"tue":{"start":"10:00","end":"19:00","active":true},"wed":{"start":"10:00","end":"19:00","active":true},"thu":{"start":"10:00","end":"19:00","active":true},"fri":{"start":"10:00","end":"18:00","active":true},"sat":{"active":false},"sun":{"active":false}}'::jsonb,
     '[{"start":"13:00","end":"13:30"}]'::jsonb,
     NOW(), NOW()),

    ('b0000000-0000-0000-0000-000000000003'::uuid, tid,
     'Переговорная "Альфа"', 'room', 'Переговорная на 8 человек, проектор, доска',
     true,
     '{"mon":{"start":"08:00","end":"20:00","active":true},"tue":{"start":"08:00","end":"20:00","active":true},"wed":{"start":"08:00","end":"20:00","active":true},"thu":{"start":"08:00","end":"20:00","active":true},"fri":{"start":"08:00","end":"20:00","active":true},"sat":{"start":"10:00","end":"16:00","active":true},"sun":{"active":false}}'::jsonb,
     '[]'::jsonb,
     NOW(), NOW());

  RAISE NOTICE 'Inserted 3 booking_resources';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. Бронирование — Записи (bookings)
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO bookings (id, tenant_id, service_id, resource_id, client_name, client_phone, client_email, date, start_time, end_time, status, notes, price, is_paid, created_at, updated_at)
  VALUES
    -- Сегодня — завершена
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000001'::uuid,
     'b0000000-0000-0000-0000-000000000001'::uuid,
     'Игорь Петров', '+7 (916) 123-45-67', 'petrov@alfastroy.ru',
     CURRENT_DATE, '10:00', '11:00', 'completed',
     'Первичная встреча, обсудили потребности по CRM',
     500000, true, NOW() - interval '3 days', NOW()),

    -- Сегодня — подтверждена
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000002'::uuid,
     'b0000000-0000-0000-0000-000000000002'::uuid,
     'Анна Козлова', '+7 (903) 987-65-43', 'kozlova@mediafocus.ru',
     CURRENT_DATE, '14:00', '14:45', 'confirmed',
     'Демо маркетинг-модуля для агентства',
     0, false, NOW() - interval '2 days', NOW()),

    -- Завтра
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000003'::uuid,
     'b0000000-0000-0000-0000-000000000001'::uuid,
     'Сергей Лебедев', '+7 (925) 555-12-34', 'lebedev@technopak.ru',
     CURRENT_DATE + interval '1 day', '11:00', '13:00', 'confirmed',
     'Настройка склада и логистики, придут 3 человека',
     1500000, false, NOW() - interval '5 days', NOW()),

    -- Через 2 дня
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000004'::uuid,
     'b0000000-0000-0000-0000-000000000002'::uuid,
     'Марина Новикова', '+7 (915) 777-88-99', 'novikova@medcenter.ru',
     CURRENT_DATE + interval '2 days', '10:00', '11:30', 'confirmed',
     'Аудит HR: онбординг, адаптация, KPI',
     1000000, false, NOW() - interval '1 day', NOW()),

    -- Через 3 дня
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000001'::uuid,
     'b0000000-0000-0000-0000-000000000003'::uuid,
     'Олег Фёдоров', '+7 (926) 333-44-55', 'fedorov@freshmarket.ru',
     CURRENT_DATE + interval '3 days', '15:00', '16:00', 'confirmed',
     'Обсуждение расширения подписки, модуль HR',
     500000, false, NOW(), NOW()),

    -- Через 4 дня — неявка (no_show для разнообразия статусов)
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000002'::uuid,
     'b0000000-0000-0000-0000-000000000001'::uuid,
     'Виктория Белова', '+7 (909) 222-33-44', 'belova@gmail.com',
     CURRENT_DATE - interval '2 days', '16:00', '16:45', 'no_show',
     'Не пришла, перезвонить',
     0, false, NOW() - interval '7 days', NOW()),

    -- Отменённая
    (gen_random_uuid(), tid,
     'a0000000-0000-0000-0000-000000000003'::uuid,
     'b0000000-0000-0000-0000-000000000002'::uuid,
     'Артём Соколов', '+7 (917) 111-22-33', 'sokolov@stilinterier.ru',
     CURRENT_DATE + interval '1 day', '15:00', '17:00', 'cancelled',
     'Отменил — выбрали другое решение',
     1500000, false, NOW() - interval '4 days', NOW());

  RAISE NOTICE 'Inserted 7 bookings';

END $$;

COMMIT;

-- ============================================================================
-- Проверка после запуска:
-- SELECT stage, count(*), sum(amount)/100 as sum_rub FROM sales_deals GROUP BY stage;
-- SELECT s.name, count(b.id) FROM booking_services s LEFT JOIN bookings b ON b.service_id = s.id GROUP BY s.name;
-- SELECT * FROM booking_resources;
-- ============================================================================
