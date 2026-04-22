-- Seed для дашборда базы знаний (демо-презентация 22.04.2026).
-- Tenant: COMPANY24.PRO (id = ae75117f-a3b7-49f5-abf3-8b3fbd9e3de9).
-- 25 сотрудников (недостающих досоздаём с префиксом "Демо:"),
-- 7 статей (2 из них устаревших), 1 учебный план, 18 назначений разных статусов.
-- Идемпотентно: чистит прежний seed перед вставкой.

DO $$
DECLARE
  v_tenant UUID := 'ae75117f-a3b7-49f5-abf3-8b3fbd9e3de9';
  v_author UUID;
  v_category_id UUID;
  v_plan_id UUID;
  v_art_ids UUID[] := ARRAY[]::UUID[];
  v_user_ids UUID[];
  v_a1 UUID; v_a2 UUID; v_a3 UUID; v_a4 UUID; v_a5 UUID; v_a6 UUID; v_a7 UUID;
  v_materials_json JSONB;
  v_active_count INT;
  v_needed INT;
  -- bcrypt-хэш строки "password" — публично известный пример.
  -- Демо-пользователи не предназначены для логина через форму,
  -- это stub, чтобы пройти NOT NULL на password_hash.
  v_demo_hash TEXT := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  v_i INT;
BEGIN
  -- ── Проверка tenant ─────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = v_tenant) THEN
    RAISE NOTICE 'Компания COMPANY24.PRO (id=%) не найдена — seed пропущен', v_tenant;
    RETURN;
  END IF;

  -- ── Чистим прежний seed ─────────────────────────────────────────────────
  -- 1) Assignments и планы демо
  DELETE FROM learning_assignments
  WHERE plan_id IN (SELECT id FROM learning_plans WHERE tenant_id = v_tenant AND title LIKE 'Демо: %');
  DELETE FROM learning_plans WHERE tenant_id = v_tenant AND title LIKE 'Демо: %';
  -- 2) Статьи демо
  DELETE FROM knowledge_articles WHERE tenant_id = v_tenant AND 'demo_knowledge' = ANY(tags);
  -- 3) Категория демо
  DELETE FROM knowledge_categories WHERE tenant_id = v_tenant AND name = 'Демо: Онбординг';
  -- 4) Демо-пользователи (маркер — префикс "Демо:" в position)
  DELETE FROM users WHERE company_id = v_tenant AND position LIKE 'Демо:%';

  -- ── Автор статей: любой реальный активный пользователь tenant'а ─────────
  SELECT id INTO v_author
  FROM users
  WHERE company_id = v_tenant AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_author IS NULL THEN
    RAISE NOTICE 'В tenant=% нет ни одного активного пользователя для автора — seed пропущен', v_tenant;
    RETURN;
  END IF;

  -- ── Добиваем до 25 активных: если < 18, создаём недостающих демо ────────
  SELECT count(*) INTO v_active_count
  FROM users
  WHERE company_id = v_tenant AND is_active = true;

  IF v_active_count < 18 THEN
    v_needed := 25 - v_active_count;

    INSERT INTO users (email, name, password_hash, role, company_id, position, is_active)
    SELECT
      'demo-' || n || '@company24.pro',
      full_name,
      v_demo_hash,
      'observer',              -- см. lib/auth.tsx: CLIENT_ROLES
      v_tenant,
      'Демо: ' || position_label,
      true
    FROM (VALUES
      (1,  'Анна Смирнова',       'Менеджер по продажам'),
      (2,  'Дмитрий Ковалёв',     'Разработчик'),
      (3,  'Екатерина Волкова',   'HR-менеджер'),
      (4,  'Иван Петров',         'Маркетолог'),
      (5,  'Мария Соколова',      'Дизайнер'),
      (6,  'Александр Иванов',    'Аналитик'),
      (7,  'Ольга Новикова',      'Бухгалтер'),
      (8,  'Сергей Морозов',      'Менеджер по продажам'),
      (9,  'Наталья Кузнецова',   'Офис-менеджер'),
      (10, 'Павел Соловьёв',      'Разработчик'),
      (11, 'Татьяна Лебедева',    'Маркетолог'),
      (12, 'Андрей Попов',        'Аналитик'),
      (13, 'Юлия Козлова',        'HR-менеджер'),
      (14, 'Максим Никитин',      'Финансовый менеджер'),
      (15, 'Елена Орлова',        'Дизайнер'),
      (16, 'Роман Зайцев',        'Руководитель отдела'),
      (17, 'Светлана Белова',     'Менеджер по продажам'),
      (18, 'Кирилл Фёдоров',      'Разработчик'),
      (19, 'Ирина Голубева',      'Бухгалтер'),
      (20, 'Владимир Степанов',   'Аналитик'),
      (21, 'Дарья Павлова',       'Маркетолог'),
      (22, 'Алексей Егоров',      'Менеджер по продажам'),
      (23, 'Полина Крылова',      'HR-менеджер'),
      (24, 'Михаил Тихонов',      'Разработчик'),
      (25, 'Ксения Ларина',       'Дизайнер')
    ) AS v(n, full_name, position_label)
    ORDER BY n
    LIMIT v_needed
    ON CONFLICT (email) DO NOTHING;

    RAISE NOTICE 'Создано % демо-сотрудников (было активных: %)', v_needed, v_active_count;
  END IF;

  -- ── Забираем пул из 25 активных пользователей tenant'а ──────────────────
  SELECT array_agg(id ORDER BY created_at) INTO v_user_ids
  FROM (
    SELECT id, created_at FROM users
    WHERE company_id = v_tenant AND is_active = true
    ORDER BY created_at LIMIT 25
  ) u;

  IF array_length(v_user_ids, 1) < 18 THEN
    RAISE NOTICE 'После добивки всё ещё < 18 активных (фактически %) — seed прерван', array_length(v_user_ids, 1);
    RETURN;
  END IF;

  -- ── Категория ───────────────────────────────────────────────────────────
  INSERT INTO knowledge_categories (tenant_id, name, slug, description, icon)
  VALUES (v_tenant, 'Демо: Онбординг', 'demo-onboarding', 'Материалы для новых сотрудников', '📚')
  RETURNING id INTO v_category_id;

  -- ── 7 статей: 5 свежих + 2 устаревших (valid_until в прошлом / скоро) ──
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'Регламент внутренних коммуникаций', 'demo-comms',
     '# Как мы общаемся\n\nSlack, email, встречи...', 'Как мы общаемся внутри команды',
     v_author, 'published', ARRAY['demo_knowledge','регламент'], NULL, 'none', 142)
    RETURNING id INTO v_a1;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'Охрана труда: базовый инструктаж', 'demo-safety',
     '# Техника безопасности\n\nОсновные правила...', 'Обязательный инструктаж',
     v_author, 'published', ARRAY['demo_knowledge','безопасность'], NOW() + INTERVAL '180 days', 'yearly', 221)
    RETURNING id INTO v_a2;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'Как работать с CRM', 'demo-crm',
     '# Работа с CRM\n\nСоздание сделок, воронка...', 'Базовые процессы в CRM',
     v_author, 'published', ARRAY['demo_knowledge','crm'], NULL, 'none', 87)
    RETURNING id INTO v_a3;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'Политика отпусков и больничных', 'demo-vacation',
     '# Отпуска и больничные\n\nПорядок оформления...', 'Как оформить отпуск',
     v_author, 'published', ARRAY['demo_knowledge','hr'], NULL, 'none', 301)
    RETURNING id INTO v_a4;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'Бренд-гайд компании', 'demo-brand',
     '# Бренд\n\nЛоготип, цвета, тон голоса...', 'Визуальный и вербальный стиль',
     v_author, 'published', ARRAY['demo_knowledge','бренд'], NULL, 'none', 64)
    RETURNING id INTO v_a5;
  -- Устаревшая #1: valid_until уже прошёл
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'Политика удалённой работы (2024)', 'demo-remote',
     '# Удалёнка\n\nРедакция 2024 года...', 'Правила работы из дома',
     v_author, 'published', ARRAY['demo_knowledge','регламент'], NOW() - INTERVAL '14 days', 'yearly', 195)
    RETURNING id INTO v_a6;
  -- Устаревшая #2: valid_until истекает в ближайшие 7 дней (попадёт в "expiring")
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (v_tenant, v_category_id, 'ДМС и корпоративные льготы', 'demo-benefits',
     '# ДМС\n\nПолис действует до...', 'Медстраховка и плюшки',
     v_author, 'published', ARRAY['demo_knowledge','hr'], NOW() + INTERVAL '5 days', 'yearly', 178)
    RETURNING id INTO v_a7;

  v_art_ids := ARRAY[v_a1, v_a2, v_a3, v_a4, v_a5, v_a6, v_a7];

  -- ── Учебный план со всеми 7 статьями ───────────────────────────────────
  SELECT jsonb_agg(
           jsonb_build_object(
             'materialId', aid::text,
             'materialType', 'article',
             'order', ord,
             'required', true
           ) ORDER BY ord
         )
    INTO v_materials_json
  FROM unnest(v_art_ids) WITH ORDINALITY AS t(aid, ord);

  INSERT INTO learning_plans (tenant_id, title, description, materials, created_by)
  VALUES (
    v_tenant,
    'Демо: Онбординг новичка',
    'Обязательный курс для всех новых сотрудников',
    v_materials_json,
    v_author
  )
  RETURNING id INTO v_plan_id;

  -- ── 18 назначений: 7 completed + 6 in_progress + 3 overdue + 2 assigned ─
  -- Completed (все 7 материалов done, completed_at в последние 30 дней)
  FOR v_i IN 1..7 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline, completed_at)
    VALUES (
      v_plan_id,
      v_user_ids[v_i],
      v_tenant,
      'completed',
      (SELECT jsonb_object_agg(aid::text, true) FROM unnest(v_art_ids) AS aid),
      NOW() - INTERVAL '60 days',
      NOW() - INTERVAL '30 days',
      NOW() - (v_i || ' days')::INTERVAL
    );
  END LOOP;

  -- In progress (часть материалов done, дедлайн впереди)
  FOR v_i IN 8..13 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline)
    VALUES (
      v_plan_id,
      v_user_ids[v_i],
      v_tenant,
      'in_progress',
      -- (v_i-7) материалов отмечены done: 1..6 из 7
      (SELECT jsonb_object_agg(aid::text, true)
         FROM unnest(v_art_ids[1:(v_i-7)]) AS aid),
      NOW() - INTERVAL '20 days',
      NOW() + INTERVAL '10 days'
    );
  END LOOP;

  -- Overdue (дедлайн в прошлом, не completed → dashboard-stats посчитает как overdue)
  FOR v_i IN 14..16 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline)
    VALUES (
      v_plan_id,
      v_user_ids[v_i],
      v_tenant,
      'in_progress',
      jsonb_build_object(v_art_ids[1]::text, true),
      NOW() - INTERVAL '45 days',
      NOW() - INTERVAL '5 days'
    );
  END LOOP;

  -- Just assigned (не начали, дедлайн впереди)
  FOR v_i IN 17..18 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline)
    VALUES (
      v_plan_id,
      v_user_ids[v_i],
      v_tenant,
      'assigned',
      '{}'::jsonb,
      NOW() - INTERVAL '2 days',
      NOW() + INTERVAL '20 days'
    );
  END LOOP;

  RAISE NOTICE 'Seed knowledge demo готов: tenant=%, пользователей взято=%, статей=7, assignments=18 (7 completed / 6 in_progress / 3 overdue / 2 assigned), устаревших материалов=2',
               v_tenant, array_length(v_user_ids, 1);
END $$;
