-- Demo goals для первого активного пользователя (для демо 21.04.2026).
-- Идемпотентно: удаляет старые seed-цели перед вставкой.

DO $$
DECLARE
  demo_user UUID;
  yearly_id UUID;
  monthly_id UUID;
BEGIN
  -- Берём первого активного пользователя с companyId
  SELECT id INTO demo_user
  FROM users
  WHERE is_active = true AND company_id IS NOT NULL
  ORDER BY created_at
  LIMIT 1;

  IF demo_user IS NULL THEN
    RAISE NOTICE 'Нет активного пользователя — seed пропущен';
    RETURN;
  END IF;

  -- Чистим старые demo-цели этого пользователя, чтобы seed был идемпотентным
  DELETE FROM goals WHERE user_id = demo_user;

  -- Годовая цель
  INSERT INTO goals (user_id, level, title, description, target_value, target_unit, current_value, deadline)
  VALUES (demo_user, 'yearly',
          'Выручка 50 млн ₽ за 2026 год',
          'Годовой план по выручке компании',
          50, 'млн ₽', 11.5, '2026-12-31')
  RETURNING id INTO yearly_id;

  INSERT INTO goals (user_id, level, title, description, target_value, target_unit, current_value, deadline)
  VALUES (demo_user, 'yearly',
          'Запустить 3 новых модуля платформы',
          'Конфигуратор, Координатор, AI-Sales',
          3, 'модулей', 1, '2026-12-31');

  -- Месячная цель (апрель)
  INSERT INTO goals (user_id, parent_id, level, title, target_value, target_unit, current_value, deadline)
  VALUES (demo_user, yearly_id, 'monthly',
          'Апрель: 4 млн ₽', 4, 'млн ₽', 2.5, '2026-04-30')
  RETURNING id INTO monthly_id;

  -- Месячная цель (май, без прогресса)
  INSERT INTO goals (user_id, parent_id, level, title, target_value, target_unit, current_value, deadline)
  VALUES (demo_user, yearly_id, 'monthly',
          'Май: 5 млн ₽', 5, 'млн ₽', 0, '2026-05-31');

  -- Недельные цели
  INSERT INTO goals (user_id, parent_id, level, title, target_value, target_unit, current_value, deadline, is_focus_today)
  VALUES
    (demo_user, monthly_id, 'weekly',
     'Подписать 2 контракта на этой неделе',
     2, 'контрактов', 1, '2026-04-26', TRUE),
    (demo_user, NULL, 'weekly',
     'Провести 15 встреч с клиентами',
     15, 'встреч', 8, '2026-04-26', FALSE),
    (demo_user, NULL, 'weekly',
     'Написать статью про Координатор Целей',
     1, 'статью', 0, '2026-04-26', TRUE);

  RAISE NOTICE 'Seed завершён для user_id=%', demo_user;
END $$;
