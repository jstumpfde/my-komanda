# Модуль «Мониторинг цен» (price_monitor) — дизайн, 05.07.2026

Заказ Юрия: парсинг цен конкурентов, первый источник — Airbnb. Наши объекты vs
конкуренты рядом (по ЖК и/или радиусу), таблица цен по периодам проживания
(7/14/28/30 ночей, настраивается), мониторинг по расписанию (раз в сутки в
заданное время; интервал настраивается — минуты/часы/дни). MVP, дорабатываем
итеративно.

## Принципы
- Архитектура адаптеров: `lib/price-monitor/sources/<source>.ts` реализует общий
  интерфейс — Airbnb первый, дальше Суточно/Авито/Островок без переделки ядра.
- Никакого хардкода порогов/периодов/расписаний — всё настройки (платформа →
  компания → объект), см. правило never-hardcode-configurable-content.
- Прод-IP в РФ: Airbnb может быть недоступен — fetch через настраиваемый
  внешний прокси (env PRICE_MONITOR_PROXY_URL, кандидат — рижский VPS).

## Модуль
- Новый ModuleId `price_monitor` в lib/modules/types.ts + registry.ts,
  basePath `/pricing`, пункты: «Объекты», «Настройки».
- Страницы: `app/(modules)/pricing/page.tsx` (список объектов),
  `app/(modules)/pricing/objects/[id]/page.tsx` (таблица сравнения),
  `app/(modules)/pricing/settings/page.tsx`.
- Гейт как у остальных модулей (enabled_modules компании), API — requireAuth
  + tenant-изоляция по company_id; настройки — requireDirector.

## БД (миграция 0256_price_monitor.sql)
- `price_monitor_objects` — наши объекты:
  id, company_id FK, name, source ('airbnb'), external_id, url, lat, lng,
  address, complex_name (ЖК), is_active bool, settings_json jsonb
  (radius_m, periods int[], complex_filter, schedule {intervalMinutes|null,
  runAtTime "HH:MM"}, autoDiscover bool), last_checked_at, created_at.
- `price_monitor_competitors`:
  id, object_id FK cascade, source, external_id, url, name, lat, lng,
  distance_m, complex_name, discovered ('auto'|'manual'), is_ignored bool,
  first_seen_at, last_seen_at. UNIQUE(object_id, source, external_id).
- `price_monitor_snapshots` — срезы цен:
  id, object_id FK cascade, competitor_id FK cascade NULL (NULL = наш объект),
  period_nights int, checkin_date date, checkout_date date,
  price_total numeric, price_per_night numeric, currency, available bool,
  raw_json jsonb, captured_at. INDEX (object_id, captured_at DESC),
  INDEX (competitor_id, captured_at DESC).
- `price_monitor_settings` — company-level дефолты:
  company_id PK FK, radius_m int default 1000, periods int[] default
  {7,14,28,30}, interval_minutes int default 1440, run_at_time text
  default '06:00', currency, updated_at.

## Ядро lib/price-monitor/
- `types.ts` — PriceSource interface:
  `resolveListing(url) → {externalId, name, lat, lng, address}`,
  `searchNearby({lat,lng,radiusM,checkin,checkout,guests}) → NearbyListing[]`
  (с ценой за диапазон),
  `getPrice(externalId, checkin, checkout) → {total, perNight, currency, available}`.
- `sources/airbnb.ts` — реализация (детали по результатам разведки:
  GraphQL StaysSearch + календарь/цена листинга, публичный X-Airbnb-API-Key,
  ретраи, троттлинг, прокси).
- `run-monitor.ts` — прогон одного объекта: цены нашего объекта по каждому
  периоду (checkin = завтра, checkout = +N ночей) → auto-discovery конкурентов
  в радиусе (если включён) с фильтром по ЖК → цены конкурентов по периодам →
  snapshots одной пачкой. Троттлинг между запросами, cap времени на объект.

## API
- `GET/POST /api/modules/pricing/objects` — список/создание (по URL Airbnb —
  resolveListing).
- `GET/PUT/DELETE /api/modules/pricing/objects/[id]` — детали+настройки.
- `POST /api/modules/pricing/objects/[id]/run` — ручной прогон сейчас.
- `GET /api/modules/pricing/objects/[id]/comparison?date=` — данные таблицы
  (последний срез или на дату): строки наш+конкуренты × колонки периоды,
  дельта к медиане конкурентов.
- `GET/PUT /api/modules/pricing/settings` — company-дефолты (PUT requireDirector).
- `POST/DELETE /api/modules/pricing/objects/[id]/competitors[/...]` — ручное
  добавление / игнор конкурента.

## Крон
- `/api/cron/price-monitor-tick`, X-Cron-Secret, crontab каждые 15 мин.
- Выбирает объекты, у которых пора: eff-настройки (объект→компания),
  now >= last_checked_at + interval И (если задан runAtTime) текущее окно
  соответствует. Лог в cron_runs (startCronRun/finishCronRun), лимит объектов
  за тик (чтобы не упереться в rate limit Airbnb).

## UI (эталон дизайна — /hr/calendar, shadcn, без кастомных hex)
- Список объектов: карточки (имя, ЖК, конкурентов найдено, последний срез,
  свежая цена/ночь) + «Добавить объект» (вставить ссылку Airbnb).
- Таблица сравнения: строки = наш объект (выделен) + конкуренты
  (сортировка цена/дистанция), колонки = периоды: цена/ночь + итого;
  бэдж дельты нашей цены к медиане конкурентов по каждому периоду;
  переключатель даты среза (история). Действия по конкуренту: игнор, ссылка.
- Настройки: радиус, фильтр ЖК, периоды (мультивыбор), расписание
  (интервал + время суток), авто-поиск конкурентов вкл/выкл.

## Этапы (агенты — Sonnet 5; адаптер Airbnb и ревью — координатор)
1. Миграция 0256 + schema.ts + модуль в registry + каркас страниц — агент.
2. Адаптер Airbnb + run-monitor — координатор (по разведке).
3. API-роуты + крон — агент.
4. UI таблица/настройки — агент.
5. Сквозное ревью цепочки UI→API→БД, tenant-isolation-check, predeploy-guard.
