-- Seed: привязка отделов к модулям
-- Выполнять после создания отделов в конкретном тенанте

-- Пример привязок (замените UUID на реальные):
-- UPDATE departments SET modules = '["crm", "b2b"]' WHERE name = 'Продажи' AND tenant_id = 'YOUR_TENANT_ID';
-- UPDATE departments SET modules = '["hr", "learning"]' WHERE name = 'HR' AND tenant_id = 'YOUR_TENANT_ID';
-- UPDATE departments SET modules = '["tasks"]' WHERE name = 'Разработка' AND tenant_id = 'YOUR_TENANT_ID';
-- UPDATE departments SET modules = '["marketing"]' WHERE name = 'Маркетинг' AND tenant_id = 'YOUR_TENANT_ID';
-- UPDATE departments SET modules = '["hr", "crm", "marketing", "tasks", "learning", "knowledge", "logistics", "warehouse", "booking"]' WHERE name = 'Руководство' AND tenant_id = 'YOUR_TENANT_ID';

-- Типичные привязки отделов к модулям:
-- Продажи     → crm, b2b
-- HR          → hr, learning
-- Разработка  → tasks
-- Маркетинг   → marketing
-- Логистика   → logistics, warehouse
-- Руководство → все модули
