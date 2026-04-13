BEGIN;
DO $$
DECLARE tid uuid;
DECLARE dep_mgmt uuid; DECLARE dep_sales uuid; DECLARE dep_hr uuid; DECLARE dep_dev uuid; DECLARE dep_mkt uuid;
BEGIN
  SELECT id INTO tid FROM companies ORDER BY created_at LIMIT 1;
  IF tid IS NULL THEN RAISE EXCEPTION 'No companies'; END IF;

  INSERT INTO departments (id, tenant_id, name, description) VALUES
    ('d0000001-0000-0000-0000-000000000001'::uuid, tid, 'Руководство', 'Топ-менеджмент компании'),
    ('d0000001-0000-0000-0000-000000000002'::uuid, tid, 'Продажи', 'Отдел продаж и работы с клиентами'),
    ('d0000001-0000-0000-0000-000000000003'::uuid, tid, 'HR', 'Управление персоналом и найм'),
    ('d0000001-0000-0000-0000-000000000004'::uuid, tid, 'Разработка', 'Отдел разработки продукта'),
    ('d0000001-0000-0000-0000-000000000005'::uuid, tid, 'Маркетинг', 'Продвижение и контент');

  dep_mgmt := 'd0000001-0000-0000-0000-000000000001'::uuid;
  dep_sales := 'd0000001-0000-0000-0000-000000000002'::uuid;
  dep_hr := 'd0000001-0000-0000-0000-000000000003'::uuid;
  dep_dev := 'd0000001-0000-0000-0000-000000000004'::uuid;
  dep_mkt := 'd0000001-0000-0000-0000-000000000005'::uuid;

  INSERT INTO positions (tenant_id, department_id, name, description, grade, salary_min, salary_max) VALUES
    (tid, dep_mgmt, 'Генеральный директор', 'Руководитель компании', 'C-level', 30000000, 50000000),
    (tid, dep_mgmt, 'Финансовый директор', 'CFO', 'C-level', 25000000, 40000000),
    (tid, dep_sales, 'Руководитель отдела продаж', 'Head of Sales', 'Senior', 15000000, 25000000),
    (tid, dep_sales, 'Менеджер по продажам', 'Account Executive', 'Middle', 8000000, 15000000),
    (tid, dep_sales, 'SDR', 'Sales Development Representative', 'Junior', 5000000, 8000000),
    (tid, dep_hr, 'HR-директор', 'Руководитель HR-отдела', 'Senior', 15000000, 22000000),
    (tid, dep_hr, 'HR-менеджер', 'Рекрутер и HR-специалист', 'Middle', 7000000, 12000000),
    (tid, dep_dev, 'CTO', 'Технический директор', 'C-level', 28000000, 45000000),
    (tid, dep_dev, 'Senior Developer', 'Старший разработчик', 'Senior', 18000000, 30000000),
    (tid, dep_dev, 'Junior Developer', 'Младший разработчик', 'Junior', 6000000, 10000000),
    (tid, dep_mkt, 'Маркетолог', 'Digital-маркетолог', 'Middle', 8000000, 14000000),
    (tid, dep_mkt, 'Контент-менеджер', 'Создание контента и SMM', 'Junior', 5000000, 9000000);

  RAISE NOTICE 'Inserted 5 departments and 12 positions for tenant %', tid;
END $$;
COMMIT;
