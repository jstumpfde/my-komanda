Прочитай это ТЗ и выполни.

# TZ-LOGISTICS-00: Переименование модуля «Логистика и склад» → «Склад»

## Контекст
Сейчас модуль logistics содержит страницы склада (товары, склады, заказы, возвраты и т.д.).
Нужно переименовать его в warehouse, чтобы освободить путь /logistics для нового модуля грузоперевозок.

## Что сделать

### 1. Переместить папку
Переименуй (mv) папку:
app/(modules)/logistics/ → app/(modules)/warehouse/

### 2. Обновить registry
В lib/modules/registry.ts:
- Переименуй ключ logistics → warehouse
- Обнови поля:
  id: 'warehouse'
  name: 'Склад'
  description: 'Товары, склады, заказы, отгрузки'
  icon: 'Warehouse'
  basePath: '/warehouse'
- Обнови ВСЕ href в menuItems: /logistics/xxx → /warehouse/xxx

### 3. Обновить sidebar groups
В lib/sidebar/module-menus.ts:
- Переименуй ключ logistics → warehouse
- Обнови все hrefs: /logistics/xxx → /warehouse/xxx

### 4. Обновить types
В lib/modules/types.ts:
- Если есть тип ModuleId — добавь 'warehouse' и убери 'logistics' если он был (logistics понадобится для нового модуля)
- Если ModuleId — union type, просто замени 'logistics' на 'warehouse' | 'logistics'
  (оставь logistics в типе — он будет использован для нового модуля)

### 5. Обновить tenant_modules и middleware
Поищи grep -r "logistics" в lib/ и middleware/ — если где-то хардкодится 'logistics' как moduleId, замени на 'warehouse'.
НО: если это generic код который просто читает из registry — не трогай.

```bash
grep -rn "'logistics'" lib/ middleware/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

### 6. Проверить внутри страниц
Внутри файлов app/(modules)/warehouse/*/page.tsx — проверь нет ли хардкоженных путей /logistics/:
```bash
grep -rn "/logistics/" app/\(modules\)/warehouse/ --include="*.tsx"
```
Если есть — замени на /warehouse/.

## НЕ ТРОГАЙ
- HR-страницы
- globals.css
- API routes (если есть /api/logistics — НЕ переименовывай, это отдельная задача)
- Содержимое страниц склада (только пути)

## Проверка
1. pnpm tsc --noEmit 2>&1 | head -30 — нет ошибок типов
2. В sidebar модуль называется "Склад" с иконкой Warehouse
3. Все страницы /warehouse/* открываются
4. /logistics/* — 404 (папка пустая или не существует)
