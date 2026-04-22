-- Seed для дашборда базы знаний (демо-презентация 22.04.2026).
-- 7 статей (2 из них устаревших), 1 учебный план, 18 назначений разных статусов.
-- Идемпотентно: удаляет прежний seed по тегу 'demo_knowledge' перед вставкой.

DO $$
DECLARE
  tenant UUID;
  author UUID;
  category_id UUID;
  plan_id UUID;
  art_ids UUID[] := ARRAY[]::UUID[];
  user_ids UUID[];
  a1 UUID; a2 UUID; a3 UUID; a4 UUID; a5 UUID; a6 UUID; a7 UUID;
  materials_json JSONB;
  i INT;
BEGIN
  -- ── Tenant + автор ──────────────────────────────────────────────────────
  SELECT id INTO tenant
  FROM companies
  ORDER BY created_at
  LIMIT 1;

  IF tenant IS NULL THEN
    RAISE NOTICE 'Нет компаний — seed пропущен';
    RETURN;
  END IF;

  SELECT id INTO author
  FROM users
  WHERE company_id = tenant AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF author IS NULL THEN
    RAISE NOTICE 'Нет активных пользователей в tenant=% — seed пропущен', tenant;
    RETURN;
  END IF;

  -- ── Берём 25 сотрудников (минимум 18 нужно для назначений) ─────────────
  SELECT array_agg(id ORDER BY created_at) INTO user_ids
  FROM (
    SELECT id, created_at FROM users
    WHERE company_id = tenant AND is_active = true
    ORDER BY created_at LIMIT 25
  ) u;

  IF array_length(user_ids, 1) < 18 THEN
    RAISE NOTICE 'В tenant=% только % активных пользователей — нужно 18+', tenant, array_length(user_ids, 1);
    RETURN;
  END IF;

  -- ── Чистим прежний seed ─────────────────────────────────────────────────
  DELETE FROM learning_assignments
  WHERE plan_id IN (SELECT id FROM learning_plans WHERE tenant_id = tenant AND title LIKE 'Демо: %');
  DELETE FROM learning_plans WHERE tenant_id = tenant AND title LIKE 'Демо: %';
  DELETE FROM knowledge_articles WHERE tenant_id = tenant AND 'demo_knowledge' = ANY(tags);
  DELETE FROM knowledge_categories WHERE tenant_id = tenant AND name = 'Демо: Онбординг';

  -- ── Категория ───────────────────────────────────────────────────────────
  INSERT INTO knowledge_categories (tenant_id, name, slug, description, icon)
  VALUES (tenant, 'Демо: Онбординг', 'demo-onboarding', 'Материалы для новых сотрудников', '📚')
  RETURNING id INTO category_id;

  -- ── 7 статей: 5 свежих + 2 устаревших (valid_until в прошлом / скоро) ──
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'Регламент внутренних коммуникаций', 'demo-comms',
     '# Как мы общаемся\n\nSlack, email, встречи...', 'Как мы общаемся внутри команды',
     author, 'published', ARRAY['demo_knowledge','регламент'], NULL, 'none', 142)
    RETURNING id INTO a1;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'Охрана труда: базовый инструктаж', 'demo-safety',
     '# Техника безопасности\n\nОсновные правила...', 'Обязательный инструктаж',
     author, 'published', ARRAY['demo_knowledge','безопасность'], NOW() + INTERVAL '180 days', 'yearly', 221)
    RETURNING id INTO a2;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'Как работать с CRM', 'demo-crm',
     '# Работа с CRM\n\nСоздание сделок, воронка...', 'Базовые процессы в CRM',
     author, 'published', ARRAY['demo_knowledge','crm'], NULL, 'none', 87)
    RETURNING id INTO a3;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'Политика отпусков и больничных', 'demo-vacation',
     '# Отпуска и больничные\n\nПорядок оформления...', 'Как оформить отпуск',
     author, 'published', ARRAY['demo_knowledge','hr'], NULL, 'none', 301)
    RETURNING id INTO a4;
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'Бренд-гайд компании', 'demo-brand',
     '# Бренд\n\nЛоготип, цвета, тон голоса...', 'Визуальный и вербальный стиль',
     author, 'published', ARRAY['demo_knowledge','бренд'], NULL, 'none', 64)
    RETURNING id INTO a5;
  -- Устаревшая #1: valid_until уже прошёл
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'Политика удалённой работы (2024)', 'demo-remote',
     '# Удалёнка\n\nРедакция 2024 года...', 'Правила работы из дома',
     author, 'published', ARRAY['demo_knowledge','regl'], NOW() - INTERVAL '14 days', 'yearly', 195)
    RETURNING id INTO a6;
  -- Устаревшая #2: valid_until истекает в ближайшие 7 дней (покажется в "expiring")
  INSERT INTO knowledge_articles
    (tenant_id, category_id, title, slug, content, excerpt, author_id, status, tags, valid_until, review_cycle, views_count)
  VALUES
    (tenant, category_id, 'ДМС и корпоративные льготы', 'demo-benefits',
     '# ДМС\n\nПолис действует до...', 'Медстраховка и плюшки',
     author, 'published', ARRAY['demo_knowledge','hr'], NOW() + INTERVAL '5 days', 'yearly', 178)
    RETURNING id INTO a7;

  art_ids := ARRAY[a1, a2, a3, a4, a5, a6, a7];

  -- ── Учебный план со всеми 7 статьями ───────────────────────────────────
  SELECT jsonb_agg(
           jsonb_build_object(
             'materialId', id::text,
             'materialType', 'article',
             'order', ord,
             'required', true
           ) ORDER BY ord
         )
    INTO materials_json
  FROM unnest(art_ids) WITH ORDINALITY AS t(id, ord);

  INSERT INTO learning_plans (tenant_id, title, description, materials, created_by)
  VALUES (
    tenant,
    'Демо: Онбординг новичка',
    'Обязательный курс для всех новых сотрудников',
    materials_json,
    author
  )
  RETURNING id INTO plan_id;

  -- ── 18 назначений: 7 completed + 6 in_progress + 3 overdue + 2 assigned ─
  -- Completed (все 7 материалов done, completed_at в последние 30 дней)
  FOR i IN 1..7 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline, completed_at)
    VALUES (
      plan_id,
      user_ids[i],
      tenant,
      'completed',
      (SELECT jsonb_object_agg(id::text, true) FROM unnest(art_ids) AS id),
      NOW() - INTERVAL '60 days',
      NOW() - INTERVAL '30 days',
      NOW() - (i || ' days')::INTERVAL
    );
  END LOOP;

  -- In progress (часть материалов done, дедлайн впереди)
  FOR i IN 8..13 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline)
    VALUES (
      plan_id,
      user_ids[i],
      tenant,
      'in_progress',
      -- Первые (i-7) статей помечены как done: 1..6 материалов из 7
      (SELECT jsonb_object_agg(id::text, true)
         FROM unnest(art_ids[1:(i-7)]) AS id),
      NOW() - INTERVAL '20 days',
      NOW() + INTERVAL '10 days'
    );
  END LOOP;

  -- Overdue (дедлайн в прошлом, не completed)
  FOR i IN 14..16 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline)
    VALUES (
      plan_id,
      user_ids[i],
      tenant,
      'in_progress',                              -- dashboard-stats вычислит overdue через deadline<now
      jsonb_build_object(art_ids[1]::text, true), -- пара материалов начата
      NOW() - INTERVAL '45 days',
      NOW() - INTERVAL '5 days'
    );
  END LOOP;

  -- Just assigned (не начали, дедлайн впереди)
  FOR i IN 17..18 LOOP
    INSERT INTO learning_assignments
      (plan_id, user_id, tenant_id, status, progress, assigned_at, deadline)
    VALUES (
      plan_id,
      user_ids[i],
      tenant,
      'assigned',
      '{}'::jsonb,
      NOW() - INTERVAL '2 days',
      NOW() + INTERVAL '20 days'
    );
  END LOOP;

  RAISE NOTICE 'Seed knowledge demo: tenant=%, 7 articles, 18 assignments (7 completed / 6 in_progress / 3 overdue / 2 assigned), 2 устаревших материала', tenant;
END $$;
