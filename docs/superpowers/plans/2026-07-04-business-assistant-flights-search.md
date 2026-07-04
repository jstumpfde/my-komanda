# «Бизнес-ассистент»: Авиабилеты — поиск (релиз 1, часть A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новый модуль `business_assistant` со страницей «Авиабилеты»: поиск обычных рейсов (Travelpayouts Data API) и составных маршрутов (Kiwi Tequila API), с мок-данными, пока нет реальных партнёрских ключей, и лентой «Горячие предложения» (пока пустой — наполнение через отдельный план с Telegram-крон).

**Architecture:** Два провайдер-клиента (`lib/business-assistant/flights/travelpayouts.ts`, `.../kiwi.ts`) с единым интерфейсом: если нужный env-токен не задан — возвращают детерминированные мок-данные, иначе реально дёргают API. Один API-роут `/api/modules/business-assistant/flights/search` вызывает оба параллельно и нормализует в общий тип `FlightOffer`. Модуль скрыт от всех компаний по умолчанию (НЕ добавляется в ролевые списки `getVisibleSections()`), включается точечно через `companies.enabled_modules`.

**Tech Stack:** Next.js 16.2.9 (App Router) / React 19.2.4 / Drizzle ORM 0.45.2 / `@anthropic-ai/sdk` 0.91.1 (не используется в этом плане, только в части B) / Node built-in test runner (`node:test` через `tsx --test`).

**Связанная спека:** `docs/architecture/BUSINESS-ASSISTANT-FLIGHTS-DESIGN-2026-07-04.md`

**⚠️ Git-дисциплина (важно):** работаем в общем рабочем дереве `~/Projects/my-komanda` на ветке `tmp/batch-pending`, где уже застейджено много чужих несвязанных изменений (funnel-v2 runtime и др.). **НИКОГДА** `git add -A` / `git add .` / голый `git commit` без пути. На каждом шаге коммита в этом плане используется:
```bash
git commit -m "<сообщение>" -- <только перечисленные в шаге файлы>
```
Это коммитит ровно указанные пути текущим состоянием, не трогая остальной индекс — безопасно, даже если там чужой WIP. Перед первым коммитом в сессии проверить: `git status --short` — не должно быть сюрпризов от того, что вы НЕ трогали.

---

## Файловая структура

Создать:
- `drizzle/0232_flight_deals.sql` — миграция таблицы `flight_deals` (платформенная, без `company_id`)
- `lib/business-assistant/flights/types.ts` — общие типы поиска и нормализованного предложения
- `lib/business-assistant/flights/travelpayouts.ts` — клиент обычных рейсов (мок + реальный вызов)
- `lib/business-assistant/flights/kiwi.ts` — клиент составных маршрутов (мок + реальный вызов)
- `lib/business-assistant/flights/travelpayouts.test.ts` — юнит-тесты мок-режима и нормализации
- `lib/business-assistant/flights/kiwi.test.ts` — юнит-тесты мок-режима и нормализации
- `app/api/modules/business-assistant/flights/search/route.ts` — API поиска
- `app/api/modules/business-assistant/flights/deals/route.ts` — API ленты (читает `flight_deals`, пока пусто)
- `app/(modules)/business-assistant/flights/page.tsx` — страница поиска

Изменить:
- `lib/db/schema.ts` — добавить таблицу `flightDeals`
- `lib/modules/types.ts` — добавить `'business_assistant'` в `ModuleId`
- `lib/modules/registry.ts` — добавить запись модуля `business_assistant`
- `app/api/admin/clients/[id]/route.ts` — добавить `"business_assistant"` в `MODULE_KEYS`

---

### Task 1: Таблица `flight_deals` — схема и миграция

**Files:**
- Modify: `lib/db/schema.ts` (добавить в конец файла, после последней таблицы)
- Create: `drizzle/0232_flight_deals.sql`

- [ ] **Step 1: Добавить таблицу в схему**

В `lib/db/schema.ts`, в самый конец файла (после последней экспортируемой таблицы), добавить:

```typescript
// Бизнес-ассистент → Авиабилеты: лента находок из Telegram-каналов со
// сливами дешёвых билетов. Платформенная таблица (БЕЗ company_id) — источник
// публичный, не данные конкретного клиента. Наполняется кроном
// flight-deals-ingest (см. отдельный план про Telegram-userbot). Миграция 0232.
export const flightDeals = pgTable("flight_deals", {
  id:               uuid("id").primaryKey().defaultRandom(),
  routeFrom:        text("route_from").notNull(),
  routeTo:          text("route_to").notNull(),
  priceRub:         integer("price_rub").notNull(),
  sourceChannel:    text("source_channel").notNull(),
  sourceMessageUrl: text("source_message_url").notNull().unique(),
  rawText:          text("raw_text").notNull(),
  aiExtractedJson:  jsonb("ai_extracted_json"),
  validUntil:       timestamp("valid_until", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("flight_deals_created_idx").on(t.createdAt),
])
```

- [ ] **Step 2: Написать миграцию**

Создать `drizzle/0232_flight_deals.sql`:

```sql
-- Бизнес-ассистент → Авиабилеты: лента находок из Telegram-каналов со
-- сливами дешёвых билетов. Платформенная таблица без company_id.
CREATE TABLE IF NOT EXISTS flight_deals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_from          text NOT NULL,
  route_to            text NOT NULL,
  price_rub           integer NOT NULL,
  source_channel      text NOT NULL,
  source_message_url  text NOT NULL UNIQUE,
  raw_text            text NOT NULL,
  ai_extracted_json   jsonb,
  valid_until         timestamp with time zone,
  created_at          timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flight_deals_created_idx ON flight_deals (created_at);
```

- [ ] **Step 3: Применить локально и проверить**

Run: `psql "$DATABASE_URL" -f drizzle/0232_flight_deals.sql`
Expected: `CREATE TABLE` затем `CREATE INDEX` — без ошибок.

Run: `psql "$DATABASE_URL" -c "\d flight_deals"`
Expected: таблица со столбцами из шага 2.

- [ ] **Step 4: Коммит**

```bash
git commit -m "feat(business-assistant): таблица flight_deals для ленты авиа-слив" -- lib/db/schema.ts drizzle/0232_flight_deals.sql
```

---

### Task 2: Регистрация модуля `business_assistant`

**Files:**
- Modify: `lib/modules/types.ts:2`
- Modify: `lib/modules/registry.ts` (конец файла, после записи `email_marketing`)
- Modify: `app/api/admin/clients/[id]/route.ts:15-18`

- [ ] **Step 1: Добавить ModuleId**

В `lib/modules/types.ts:2` заменить:
```typescript
export type ModuleId = 'hr' | 'knowledge' | 'learning' | 'tasks' | 'marketing' | 'sales' | 'b2b' | 'warehouse' | 'logistics' | 'booking' | 'dialer' | 'qc' | 'email_marketing'
```
на:
```typescript
export type ModuleId = 'hr' | 'knowledge' | 'learning' | 'tasks' | 'marketing' | 'sales' | 'b2b' | 'warehouse' | 'logistics' | 'booking' | 'dialer' | 'qc' | 'email_marketing' | 'business_assistant'
```

- [ ] **Step 2: Добавить запись в MODULE_REGISTRY**

В `lib/modules/registry.ts`, сразу после закрывающей `}` записи `email_marketing` (перед финальной `}` объекта `MODULE_REGISTRY`), добавить:

```typescript
  business_assistant: {
    id: 'business_assistant',
    name: 'Бизнес-ассистент',
    description: 'Поиск выгодных предложений: авиабилеты и далее другие категории',
    icon: 'Plane',
    basePath: '/business-assistant',
    menuItems: [
      { label: 'Авиабилеты', href: '/business-assistant/flights', icon: 'Plane' },
    ],
  },
```

- [ ] **Step 3: Разрешить точечное включение через админку**

В `app/api/admin/clients/[id]/route.ts:15-18` заменить:
```typescript
const MODULE_KEYS = [
  "hr", "knowledge", "learning", "tasks", "sales", "marketing",
  "b2b", "warehouse", "logistics", "booking", "dialer", "qc",
] as const
```
на:
```typescript
const MODULE_KEYS = [
  "hr", "knowledge", "learning", "tasks", "sales", "marketing",
  "b2b", "warehouse", "logistics", "booking", "dialer", "qc",
  "business_assistant",
] as const
```

**Важно:** `business_assistant` НЕ добавляется в `ALL_MODULES_LIST` / `CLIENT_MODULES_LIST` в `lib/auth.tsx` (роли не видят его по умолчанию) — это осознанное решение дизайна, модуль скрыт, пока не готов показывать всем клиентам.

- [ ] **Step 4: Проверить типы**

Run: `pnpm exec tsc --noEmit`
Expected: без новых ошибок типов (запись `business_assistant` типобезопасна).

- [ ] **Step 5: Коммит**

```bash
git commit -m "feat(business-assistant): регистрация модуля в реестре (скрыт по умолчанию)" -- lib/modules/types.ts lib/modules/registry.ts app/api/admin/clients/[id]/route.ts
```

---

### Task 3: Общие типы поиска

**Files:**
- Create: `lib/business-assistant/flights/types.ts`

- [ ] **Step 1: Написать типы**

```typescript
export interface FlightSearchParams {
  originIata:      string  // IATA код города/аэропорта вылета, напр. "MOW"
  destinationIata: string  // IATA код города/аэропорта прилёта, напр. "LED"
  departDate:      string  // YYYY-MM-DD
  returnDate?:     string  // YYYY-MM-DD, если есть — round-trip
  adults:          number
}

export interface FlightOffer {
  id:              string
  kind:            "direct" | "combo"
  priceRub:        number
  airlineLabel:    string   // "Аэрофлот" или "Аэрофлот + Победа" для combo
  transfers:       number
  durationMinutes: number | null
  savingsRub?:     number   // только для kind === "combo"
  deepLink:        string
}

export interface FlightSearchResult {
  direct: FlightOffer[]
  combo:  FlightOffer[]
}
```

- [ ] **Step 2: Коммит**

```bash
git commit -m "feat(business-assistant): общие типы поиска авиабилетов" -- lib/business-assistant/flights/types.ts
```

---

### Task 4: Клиент Travelpayouts (обычные рейсы)

**Files:**
- Create: `lib/business-assistant/flights/travelpayouts.ts`
- Test: `lib/business-assistant/flights/travelpayouts.test.ts`

Реальный эндпоинт (Aviasales Data API): `GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=...&destination=...&departure_at=...&return_at=...&sorting=price&limit=10&token=...` — токен также можно передать в заголовке `X-Access-Token`. Диплинк на покупку — `https://search.aviasales.com/flights/?origin_iata=...&destination_iata=...&depart_date=...&return_date=...&adults=...&marker=...`.

- [ ] **Step 1: Написать тест мок-режима (без токена)**

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { searchTravelpayouts } from "./travelpayouts"

test("без TRAVELPAYOUTS_API_TOKEN возвращает мок-предложения с корректным диплинком", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  process.env.TRAVELPAYOUTS_MARKER = "999999"
  const offers = await searchTravelpayouts({
    originIata: "MOW",
    destinationIata: "LED",
    departDate: "2026-08-15",
    adults: 1,
  })
  assert.ok(offers.length > 0)
  assert.equal(offers[0].kind, "direct")
  assert.ok(offers[0].priceRub > 0)
  assert.ok(offers[0].deepLink.includes("marker=999999"))
  assert.ok(offers[0].deepLink.includes("origin_iata=MOW"))
  assert.ok(offers[0].deepLink.includes("destination_iata=LED"))
})

test("предложения отсортированы по возрастанию цены", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = await searchTravelpayouts({
    originIata: "MOW",
    destinationIata: "AER",
    departDate: "2026-09-01",
    adults: 1,
  })
  for (let i = 1; i < offers.length; i++) {
    assert.ok(offers[i].priceRub >= offers[i - 1].priceRub)
  }
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает (функции ещё нет)**

Run: `pnpm exec tsx --test lib/business-assistant/flights/travelpayouts.test.ts`
Expected: FAIL — `Cannot find module './travelpayouts'`

- [ ] **Step 3: Реализовать клиент**

```typescript
import type { FlightOffer, FlightSearchParams } from "./types"

function buildAviasalesDeepLink(params: FlightSearchParams): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? ""
  const query = new URLSearchParams({
    origin_iata: params.originIata,
    destination_iata: params.destinationIata,
    depart_date: params.departDate,
    adults: String(params.adults),
    marker,
  })
  if (params.returnDate) query.set("return_date", params.returnDate)
  return `https://search.aviasales.com/flights/?${query.toString()}`
}

function mockOffers(params: FlightSearchParams): FlightOffer[] {
  const airlines = ["Аэрофлот", "Победа", "S7 Airlines"]
  const deepLink = buildAviasalesDeepLink(params)
  return airlines.map((airline, i) => ({
    id: `tp-mock-${params.originIata}-${params.destinationIata}-${i}`,
    kind: "direct" as const,
    priceRub: 4500 + i * 1800,
    airlineLabel: airline,
    transfers: i === 2 ? 1 : 0,
    durationMinutes: 90 + i * 40,
    deepLink,
  }))
}

interface TravelpayoutsPriceRow {
  price: number
  airline: string
  transfers: number
  duration: number | null
}

async function fetchRealOffers(params: FlightSearchParams, token: string): Promise<FlightOffer[]> {
  const query = new URLSearchParams({
    origin: params.originIata,
    destination: params.destinationIata,
    departure_at: params.departDate,
    sorting: "price",
    limit: "10",
    token,
  })
  if (params.returnDate) query.set("return_at", params.returnDate)

  const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${query.toString()}`)
  if (!res.ok) throw new Error(`Travelpayouts API ${res.status}`)
  const body = (await res.json()) as { data: TravelpayoutsPriceRow[] }
  const deepLink = buildAviasalesDeepLink(params)

  return body.data.map((row, i) => ({
    id: `tp-${params.originIata}-${params.destinationIata}-${i}`,
    kind: "direct" as const,
    priceRub: row.price,
    airlineLabel: row.airline,
    transfers: row.transfers,
    durationMinutes: row.duration,
    deepLink,
  }))
}

export async function searchTravelpayouts(params: FlightSearchParams): Promise<FlightOffer[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = token ? await fetchRealOffers(params, token) : mockOffers(params)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
```

- [ ] **Step 4: Запустить тест снова**

Run: `pnpm exec tsx --test lib/business-assistant/flights/travelpayouts.test.ts`
Expected: PASS (2 теста)

- [ ] **Step 5: Коммит**

```bash
git commit -m "feat(business-assistant): клиент Travelpayouts для обычных рейсов (мок + реальный)" -- lib/business-assistant/flights/types.ts lib/business-assistant/flights/travelpayouts.ts lib/business-assistant/flights/travelpayouts.test.ts
```

---

### Task 5: Клиент Kiwi Tequila (составные маршруты)

**Files:**
- Create: `lib/business-assistant/flights/kiwi.ts`
- Test: `lib/business-assistant/flights/kiwi.test.ts`

Реальный эндпоинт: `GET https://api.tequila.kiwi.com/v2/search?fly_from=...&fly_to=...&date_from=DD/MM/YYYY&date_to=DD/MM/YYYY&adults=...` с заголовком `apikey: <ключ>`. Ответ: `{ data: [{ price, deep_link, route: [{airline, flight_no}] }] }`. Диплинк на покупку — берём `deep_link` из ответа, либо (для мока) строим `https://www.kiwi.com/deep?from=...&to=...&departure=...`, обёрнутый в клик-трекер Travelpayouts: `https://c111.travelpayouts.com/click?shmarker=<marker>&promo_id=3791&source_type=customlink&type=click&custom_url=<encodeURIComponent(kiwiDeepUrl)>`.

- [ ] **Step 1: Написать тест мок-режима**

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { searchKiwiCombos } from "./kiwi"

test("без KIWI_TEQUILA_API_KEY возвращает мок-комбо с экономией и click-трекером", async () => {
  delete process.env.KIWI_TEQUILA_API_KEY
  process.env.TRAVELPAYOUTS_MARKER = "999999"
  const offers = await searchKiwiCombos({
    originIata: "MOW",
    destinationIata: "BKK",
    departDate: "2026-10-01",
    adults: 1,
  })
  assert.ok(offers.length > 0)
  assert.equal(offers[0].kind, "combo")
  assert.ok(offers[0].savingsRub && offers[0].savingsRub > 0)
  assert.ok(offers[0].deepLink.startsWith("https://c111.travelpayouts.com/click?"))
  assert.ok(offers[0].deepLink.includes("shmarker=999999"))
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm exec tsx --test lib/business-assistant/flights/kiwi.test.ts`
Expected: FAIL — `Cannot find module './kiwi'`

- [ ] **Step 3: Реализовать клиент**

```typescript
import type { FlightOffer, FlightSearchParams } from "./types"

function toKiwiDate(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

function buildClickTrackedDeepLink(kiwiDeepUrl: string): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? ""
  const query = new URLSearchParams({
    shmarker: marker,
    promo_id: "3791",
    source_type: "customlink",
    type: "click",
    custom_url: kiwiDeepUrl,
  })
  return `https://c111.travelpayouts.com/click?${query.toString()}`
}

function buildKiwiDeepUrl(params: FlightSearchParams): string {
  const query = new URLSearchParams({
    from: params.originIata,
    to: params.destinationIata,
    departure: params.departDate,
  })
  if (params.returnDate) query.set("return", params.returnDate)
  return `https://www.kiwi.com/deep?${query.toString()}`
}

function mockOffers(params: FlightSearchParams): FlightOffer[] {
  const deepLink = buildClickTrackedDeepLink(buildKiwiDeepUrl(params))
  return [
    {
      id: `kiwi-mock-${params.originIata}-${params.destinationIata}-0`,
      kind: "combo" as const,
      priceRub: 18900,
      airlineLabel: "Turkish Airlines + AirAsia (через Стамбул)",
      transfers: 2,
      durationMinutes: 620,
      savingsRub: 7300,
      deepLink,
    },
  ]
}

interface TequilaRow {
  price: number
  deep_link?: string
  route: { airline: string }[]
}

async function fetchRealOffers(params: FlightSearchParams, apiKey: string): Promise<FlightOffer[]> {
  const query = new URLSearchParams({
    fly_from: params.originIata,
    fly_to: params.destinationIata,
    date_from: toKiwiDate(params.departDate),
    date_to: toKiwiDate(params.departDate),
    adults: String(params.adults),
    curr: "RUB",
    limit: "10",
  })
  const res = await fetch(`https://api.tequila.kiwi.com/v2/search?${query.toString()}`, {
    headers: { apikey: apiKey },
  })
  if (!res.ok) throw new Error(`Kiwi Tequila API ${res.status}`)
  const body = (await res.json()) as { data: TequilaRow[] }

  return body.data
    .filter((row) => row.route.length > 1) // только составные маршруты — прямые уже покрыты Travelpayouts
    .map((row, i) => ({
      id: `kiwi-${params.originIata}-${params.destinationIata}-${i}`,
      kind: "combo" as const,
      priceRub: Math.round(row.price),
      airlineLabel: [...new Set(row.route.map((leg) => leg.airline))].join(" + "),
      transfers: row.route.length - 1,
      durationMinutes: null,
      deepLink: row.deep_link
        ? buildClickTrackedDeepLink(row.deep_link)
        : buildClickTrackedDeepLink(buildKiwiDeepUrl(params)),
    }))
}

export async function searchKiwiCombos(params: FlightSearchParams): Promise<FlightOffer[]> {
  const apiKey = process.env.KIWI_TEQUILA_API_KEY
  const offers = apiKey ? await fetchRealOffers(params, apiKey) : mockOffers(params)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
```

- [ ] **Step 4: Запустить тест снова**

Run: `pnpm exec tsx --test lib/business-assistant/flights/kiwi.test.ts`
Expected: PASS (1 тест)

- [ ] **Step 5: Коммит**

```bash
git commit -m "feat(business-assistant): клиент Kiwi Tequila для составных маршрутов (мок + реальный)" -- lib/business-assistant/flights/kiwi.ts lib/business-assistant/flights/kiwi.test.ts
```

---

### Task 6: API-роут поиска

**Files:**
- Create: `app/api/modules/business-assistant/flights/search/route.ts`

- [ ] **Step 1: Реализовать роут**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { searchTravelpayouts } from "@/lib/business-assistant/flights/travelpayouts"
import { searchKiwiCombos } from "@/lib/business-assistant/flights/kiwi"
import type { FlightSearchParams } from "@/lib/business-assistant/flights/types"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const sp = req.nextUrl.searchParams
  const originIata = sp.get("origin")
  const destinationIata = sp.get("destination")
  const departDate = sp.get("departDate")
  if (!originIata || !destinationIata || !departDate) {
    return NextResponse.json(
      { error: "Нужны параметры origin, destination, departDate" },
      { status: 400 },
    )
  }

  const params: FlightSearchParams = {
    originIata: originIata.toUpperCase(),
    destinationIata: destinationIata.toUpperCase(),
    departDate,
    returnDate: sp.get("returnDate") ?? undefined,
    adults: Number(sp.get("adults") ?? "1"),
  }

  const [direct, combo] = await Promise.all([
    searchTravelpayouts(params),
    searchKiwiCombos(params),
  ])

  return NextResponse.json({ direct, combo })
}
```

- [ ] **Step 2: Проверить вручную**

Run: `pnpm dev` (в отдельном терминале), затем:
```bash
curl -s "http://localhost:3000/api/modules/business-assistant/flights/search?origin=MOW&destination=LED&departDate=2026-08-15" -H "Cookie: <сессионная кука залогиненного пользователя>" | head -c 500
```
Expected: JSON с ключами `direct` (3 мок-предложения от Travelpayouts) и `combo` (1 мок-предложение от Kiwi). Без куки — `403 Company not found`.

- [ ] **Step 3: Коммит**

```bash
git commit -m "feat(business-assistant): API поиска авиабилетов" -- app/api/modules/business-assistant/flights/search/route.ts
```

---

### Task 7: API-роут ленты «Горячие предложения»

**Files:**
- Create: `app/api/modules/business-assistant/flights/deals/route.ts`

- [ ] **Step 1: Реализовать роут**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { flightDeals } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"))
  const pageSize = 20

  const deals = await db
    .select()
    .from(flightDeals)
    .orderBy(desc(flightDeals.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return NextResponse.json({ deals })
}
```

- [ ] **Step 2: Проверить вручную**

Run (после `psql -f drizzle/0232_flight_deals.sql`, таблица пуста):
```bash
curl -s "http://localhost:3000/api/modules/business-assistant/flights/deals" -H "Cookie: <сессионная кука>"
```
Expected: `{"deals":[]}`

- [ ] **Step 3: Коммит**

```bash
git commit -m "feat(business-assistant): API ленты горячих предложений" -- app/api/modules/business-assistant/flights/deals/route.ts
```

---

### Task 8: Страница «Авиабилеты»

**Files:**
- Create: `app/(modules)/business-assistant/flights/page.tsx`

- [ ] **Step 1: Реализовать страницу**

```tsx
"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plane, TrendingDown, Flame } from "lucide-react"

interface FlightOffer {
  id: string
  kind: "direct" | "combo"
  priceRub: number
  airlineLabel: string
  transfers: number
  durationMinutes: number | null
  savingsRub?: number
  deepLink: string
}

export default function FlightsSearchPage() {
  const [origin, setOrigin] = useState("")
  const [destination, setDestination] = useState("")
  const [departDate, setDepartDate] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direct, setDirect] = useState<FlightOffer[]>([])
  const [combo, setCombo] = useState<FlightOffer[]>([])
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    setError(null)
    if (!origin || !destination || !departDate) {
      setError("Заполните откуда, куда и дату вылета")
      return
    }
    setLoading(true)
    try {
      const query = new URLSearchParams({
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        departDate,
      })
      const res = await fetch(`/api/modules/business-assistant/flights/search?${query.toString()}`)
      if (!res.ok) throw new Error("Не удалось получить результаты")
      const data = (await res.json()) as { direct: FlightOffer[]; combo: FlightOffer[] }
      setDirect(data.direct)
      setCombo(data.combo)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка поиска")
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Авиабилеты" />
        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plane className="w-5 h-5" /> Поиск авиабилетов
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="origin">Откуда (IATA)</Label>
                <Input id="origin" placeholder="MOW" value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="destination">Куда (IATA)</Label>
                <Input id="destination" placeholder="LED" value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="departDate">Дата вылета</Label>
                <Input id="departDate" type="date" value={departDate} onChange={(e) => setDepartDate(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={handleSearch} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive md:col-span-4">{error}</p>}
            </CardContent>
          </Card>

          {searched && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Обычные рейсы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {direct.length === 0 && <p className="text-sm text-muted-foreground">Ничего не найдено</p>}
                {direct.map((offer) => (
                  <OfferRow key={offer.id} offer={offer} />
                ))}
              </CardContent>
            </Card>
          )}

          {searched && combo.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" /> Составные маршруты — дешевле обычного
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {combo.map((offer) => (
                  <OfferRow key={offer.id} offer={offer} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" /> Горячие предложения
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Пока пусто — лента наполнится, когда подключим мониторинг Telegram-каналов.
              </p>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function OfferRow({ offer }: { offer: FlightOffer }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
      <div>
        <div className="font-medium text-sm">{offer.airlineLabel}</div>
        <div className="text-xs text-muted-foreground">
          {offer.transfers === 0 ? "прямой" : `${offer.transfers} пересадк${offer.transfers === 1 ? "а" : "и"}`}
          {offer.durationMinutes ? ` · ${Math.floor(offer.durationMinutes / 60)} ч ${offer.durationMinutes % 60} мин` : ""}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {offer.savingsRub && (
          <Badge variant="secondary" className="text-emerald-600">
            −{offer.savingsRub.toLocaleString("ru-RU")} ₽
          </Badge>
        )}
        <div className="text-right">
          <div className="font-semibold">{offer.priceRub.toLocaleString("ru-RU")} ₽</div>
        </div>
        <Button asChild size="sm">
          <a href={offer.deepLink} target="_blank" rel="noopener noreferrer">
            Купить
          </a>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Проверить вручную в браузере**

Run: `pnpm dev`, открыть `http://localhost:3000/business-assistant/flights` под пользователем, у которого включён модуль (см. Task 9).
Expected: форма поиска; после ввода MOW/LED/любой даты и клика «Найти» — 3 карточки в «Обычные рейсы» с ценами от 4500₽ и 1 карточка в «Составные маршруты» с бейджем экономии; кнопка «Купить» открывает диплинк в новой вкладке; блок «Горячие предложения» показывает заглушку.

- [ ] **Step 3: Коммит**

```bash
git commit -m "feat(business-assistant): страница поиска авиабилетов" -- "app/(modules)/business-assistant/flights/page.tsx"
```

---

### Task 9: Включить модуль для тестовой компании и проверить сборку

**Files:** нет новых файлов — только ручная проверка.

- [ ] **Step 1: Включить модуль точечно (локально/на стейджинге)**

```bash
psql "$DATABASE_URL" -c "UPDATE companies SET enabled_modules = '[\"hr\", \"business_assistant\"]'::jsonb WHERE id = '<ID тестовой компании Юрия>';"
```
(Не трогает остальные компании — `enabled_modules` у них остаётся `null`, значит модуль не виден.)

- [ ] **Step 2: Полная проверка сборки**

Run: `pnpm build`
Expected: сборка зелёная, без ошибок типов/линта в новых файлах.

- [ ] **Step 3: Визуальная проверка**

Зайти под тестовой компанией → в сайдбаре должен появиться пункт «Бизнес-ассистент» → «Авиабилеты». У остальных компаний (без оверрайда) пункта быть не должно.

- [ ] **Step 4: Финальный коммит плана (если остались незакоммиченные хвосты)**

```bash
git status --short
```
Проверить, что в незакоммиченном состоянии остались только чужие файлы (не из этого плана) — если из плана что-то не закоммичено, закоммитить по имени файла, как в предыдущих шагах.

---

## Что дальше

- Отдельный план: «Бизнес-ассистент → Telegram-лента авиа-слив» — добавление npm-пакета `telegram` (GramJS), одноразовый интерактивный вход (нужен телефон Юрия), крон `flight-deals-ingest`, наполнение таблицы `flight_deals`, которую эта часть уже создала.
- Когда придут реальные `TRAVELPAYOUTS_API_TOKEN` / `TRAVELPAYOUTS_MARKER` / `KIWI_TEQUILA_API_KEY` — просто задать их в `.env` / переменных окружения PM2, код уже переключится с мока на реальные вызовы без правок.
- Когда Юрий решит показать модуль всем клиентам — добавить `'business_assistant'` в `CLIENT_MODULES_LIST` в `lib/auth.tsx` рядом с `'hr'` (одна строка).
