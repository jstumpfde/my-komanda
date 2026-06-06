# DESIGN REFERENCE — единый дизайн платформы Company24

> Эталон — страница **Календарь** (`app/(modules)/hr/calendar/page.tsx`) и её
> Sheet «Настройки календаря». ВСЕ новые страницы и любые правки делать в ЭТОМ
> стиле. Перед мерджем — сверять с этим файлом.

## Акцент / цвета
- Основной акцент — **primary (фиолетовый)**, `--primary: oklch(0.54 0.16 280)`.
  НЕ использовать кастомные цвета вроде `#C0622F` (оранжевый) — это отсебятина.
- Иконка заголовка страницы — `text-violet-600`.
- Активные/primary кнопки — обычный `<Button>` (без inline style backgroundColor).
- Бейджи статусов — semantic tokens (emerald/amber/red/muted), как уже в таблицах.

## Шапка страницы (page header)
```tsx
<div className="flex items-center gap-2 pt-3 pb-2">
  <SomeIcon className="h-5 w-5 text-violet-600" />
  <h1 className="text-lg font-semibold">Название</h1>
</div>
```
- Заголовок: `text-lg font-semibold` (НЕ text-xl).
- Контейнер страницы: `style={{ paddingLeft: 56, paddingRight: 56 }}` (как в Календаре,
  Вакансиях, Кандидатах).

## Тулбар (фильтры / переключатели вида / действия)
- Переключатели вида и фильтры — shadcn **Tabs/TabsList/TabsTrigger** (сегмент-контрол),
  НЕ кастомные кнопки с inline-цветом.
```tsx
<Tabs value={view} onValueChange={...}>
  <TabsList>
    <TabsTrigger value="day">День</TabsTrigger>
    ...
  </TabsList>
</Tabs>
```
- Навигация (стрелки/«Сегодня») — `<Button variant="outline" size="icon|sm">`.
- Основное действие — `<Button size="sm"><Plus className="h-4 w-4 mr-1" />Текст</Button>` (primary).
- Вспомогательная иконка (шестерёнка и т.п.) — `<Button variant="ghost" size="icon" className="h-8 w-8">`.

## Карточки / Sheet настроек
- Sheet: `SheetContent` + тело с горизонтальным padding (`px-4`/`px-6`), секции —
  `<Card>` с `CardHeader` (иконка + CardTitle text-sm + CardDescription) и `CardContent`.
- Тумблеры — shadcn `<Switch>` (фиолетовый). Селекты/инпуты — shadcn `Select`/`Input`.

## Таблицы
- Только через примитивы `components/ui/data-table.tsx` (TableCard/DataTable/DataHead/
  DataHeadCell/DataRow/DataCell). Шапка без uppercase, `text-sm font-semibold muted`.
  См. [[table-unification-complete]].

## Чек-лист соответствия (для каждой новой/правленой страницы)
1. Заголовок: иконка text-violet-600 + h1 text-lg font-semibold.
2. Никаких inline backgroundColor / кастомных hex-акцентов — только primary.
3. Переключатели вида — Tabs, не самодельные кнопки.
4. Таблицы — data-table примитивы.
5. padding 56px по бокам контента.
6. Тумблеры/селекты/инпуты — shadcn-компоненты.
