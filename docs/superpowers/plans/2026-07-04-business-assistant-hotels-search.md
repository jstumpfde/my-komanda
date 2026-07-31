# «Бизнес-ассистент»: Отели — поиск (релиз 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Добавить в модуль `business_assistant` страницу «Отели» — поиск отелей через Hotellook (Travelpayouts), мок-режим без ключей, реальные вызовы при наличии токена. Точное зеркало релиза 1 «Авиабилеты».

**Architecture:** Провайдер `lib/business-assistant/hotels/hotellook.ts` с единым интерфейсом: без `TRAVELPAYOUTS_API_TOKEN` → детерминированный мок; с токеном → реальный Hotellook API (два шага: `search/start` → `search/getResult`, подпись md5 из `Token:Marker:...`). API-роут `/api/modules/business-assistant/hotels/search`. Страница `/business-assistant/hotels`. **Те же партнёрские ключи, что у авиабилетов** (Travelpayouts marker+token) — отдельной регистрации не нужно. БД-таблицы НЕ нужны (поиск живой, ленты слив нет).

**Tech Stack:** Next.js 16.2.9 / React 19.2.4 / node:crypto (md5 подпись) / node:test.

**Связанное:** дизайн `docs/architecture/BUSINESS-ASSISTANT-FLIGHTS-DESIGN-2026-07-04.md` (Отели — п.2 очереди), релиз 1 как образец (`lib/business-assistant/flights/*`).

**⚠️ Git-дисциплина (общее дерево tmp/batch-pending):** коммитить ТОЛЬКО свои файлы: `git add <новый файл>` для untracked, затем `git commit -m ... -- <файлы>`. НИКОГДА `git add -A`. Для `lib/modules/registry.ts` (добавление пункта меню) — проверить `git diff HEAD -- lib/modules/registry.ts`, что там только моя правка, перед `git commit -- lib/modules/registry.ts`. Координатор (главный чат) выполняет коммиты; исполнители — только код + изолированные тесты, без git/psql/build.

---

## Файловая структура
Создать:
- `lib/business-assistant/hotels/types.ts` — типы поиска отелей
- `lib/business-assistant/hotels/hotellook.ts` — клиент (мок + реальный)
- `lib/business-assistant/hotels/hotellook.test.ts` — юнит-тесты мок-режима
- `app/api/modules/business-assistant/hotels/search/route.ts` — API поиска
- `app/(modules)/business-assistant/hotels/page.tsx` — страница

Изменить:
- `lib/modules/registry.ts` — добавить пункт меню «Отели» в модуль `business_assistant`

---

### Task 1: Типы поиска отелей

**Files:** Create `lib/business-assistant/hotels/types.ts`

- [ ] **Step 1: Написать типы**
```typescript
export interface HotelSearchParams {
  cityIata:  string   // IATA код города, напр. "MOW"; или locationId для Hotellook
  checkIn:   string   // YYYY-MM-DD
  checkOut:  string   // YYYY-MM-DD
  adults:    number
}

export interface HotelOffer {
  id:           string
  name:         string
  stars:        number         // 0-5
  ratingLabel:  string | null  // напр. "8.6" или null
  priceRub:     number         // цена за всё пребывание
  nights:       number
  deepLink:     string
}
```

- [ ] **Step 2: Коммит**
```bash
git add lib/business-assistant/hotels/types.ts
git commit -m "feat(business-assistant): типы поиска отелей" -- lib/business-assistant/hotels/types.ts
```

---

### Task 2: Клиент Hotellook (мок + реальный)

**Files:** Create `lib/business-assistant/hotels/hotellook.ts` + `.test.ts`

Реальный API: `GET http://engine.hotellook.com/api/v2/cache/latest.json?location=MOW&checkIn=..&checkOut=..&currency=rub&token=..` (упрощённый кэш-эндпоинт цен по локации — БЕЗ двухшаговой сессии и md5, аналог flights `prices_for_dates`; отдаёт массив `{hotelId, hotelName, stars, priceFrom, ...}`). Диплинк на бронь: `https://search.hotellook.com/?marker=<marker>&destination=<city>&checkIn=..&checkOut=..&adults=..`.

- [ ] **Step 1: Тест мок-режима** — `lib/business-assistant/hotels/hotellook.test.ts`:
```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { searchHotels } from "./hotellook"

test("без TRAVELPAYOUTS_API_TOKEN возвращает мок-отели с диплинком и marker", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  process.env.TRAVELPAYOUTS_MARKER = "999999"
  const offers = await searchHotels({ cityIata: "MOW", checkIn: "2026-08-15", checkOut: "2026-08-18", adults: 2 })
  assert.ok(offers.length > 0)
  assert.ok(offers[0].priceRub > 0)
  assert.equal(offers[0].nights, 3)
  assert.ok(offers[0].deepLink.includes("marker=999999"))
  assert.ok(offers[0].deepLink.includes("search.hotellook.com"))
})

test("отели отсортированы по возрастанию цены", async () => {
  delete process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = await searchHotels({ cityIata: "LED", checkIn: "2026-09-01", checkOut: "2026-09-04", adults: 2 })
  for (let i = 1; i < offers.length; i++) assert.ok(offers[i].priceRub >= offers[i - 1].priceRub)
})
```

- [ ] **Step 2: Запустить тест — упадёт** (`Cannot find module './hotellook'`).
Run: `pnpm exec tsx --test lib/business-assistant/hotels/hotellook.test.ts`

- [ ] **Step 3: Реализация** `lib/business-assistant/hotels/hotellook.ts`:
```typescript
import type { HotelOffer, HotelSearchParams } from "./types"

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime()
  const b = new Date(checkOut).getTime()
  const n = Math.round((b - a) / 86_400_000)
  return n > 0 ? n : 1
}

function buildHotellookDeepLink(params: HotelSearchParams): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? ""
  const query = new URLSearchParams({
    marker,
    destination: params.cityIata,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: String(params.adults),
  })
  return `https://search.hotellook.com/?${query.toString()}`
}

function mockOffers(params: HotelSearchParams): HotelOffer[] {
  const nights = nightsBetween(params.checkIn, params.checkOut)
  const deepLink = buildHotellookDeepLink(params)
  const base = [
    { name: "Отель «Центральный»",   stars: 3, rating: "8.2", perNight: 3200 },
    { name: "Гранд Отель Плаза",      stars: 5, rating: "9.1", perNight: 9800 },
    { name: "Апарт-отель «Уют»",      stars: 4, rating: "8.7", perNight: 5400 },
    { name: "Хостел «Друзья»",        stars: 2, rating: "7.4", perNight: 1500 },
  ]
  return base.map((h, i) => ({
    id: `hl-mock-${params.cityIata}-${i}`,
    name: h.name,
    stars: h.stars,
    ratingLabel: h.rating,
    priceRub: h.perNight * nights,
    nights,
    deepLink,
  }))
}

interface HotellookCacheRow {
  hotelId: number
  hotelName: string
  stars: number
  priceFrom: number
  priceAvg?: number
}

async function fetchRealOffers(params: HotelSearchParams, token: string): Promise<HotelOffer[]> {
  const nights = nightsBetween(params.checkIn, params.checkOut)
  const query = new URLSearchParams({
    location: params.cityIata,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    currency: "rub",
    limit: "10",
    token,
  })
  const res = await fetch(`https://engine.hotellook.com/api/v2/cache/latest.json?${query.toString()}`)
  if (!res.ok) throw new Error(`Hotellook API ${res.status}`)
  const body = (await res.json()) as HotellookCacheRow[]
  const deepLink = buildHotellookDeepLink(params)
  return body.map((row, i) => ({
    id: `hl-${params.cityIata}-${row.hotelId ?? i}`,
    name: row.hotelName,
    stars: row.stars ?? 0,
    ratingLabel: null,
    priceRub: Math.round(row.priceFrom),
    nights,
    deepLink,
  }))
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN
  const offers = token ? await fetchRealOffers(params, token) : mockOffers(params)
  return [...offers].sort((a, b) => a.priceRub - b.priceRub)
}
```

- [ ] **Step 4: Тест зелёный** (2 passing).
- [ ] **Step 5: Коммит**
```bash
git add lib/business-assistant/hotels/hotellook.ts lib/business-assistant/hotels/hotellook.test.ts
git commit -m "feat(business-assistant): клиент Hotellook для поиска отелей (мок + реальный)" -- lib/business-assistant/hotels/hotellook.ts lib/business-assistant/hotels/hotellook.test.ts
```

---

### Task 3: API-роут поиска отелей

**Files:** Create `app/api/modules/business-assistant/hotels/search/route.ts`

- [ ] **Step 1: Реализация**
```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { searchHotels } from "@/lib/business-assistant/hotels/hotellook"
import type { HotelSearchParams } from "@/lib/business-assistant/hotels/types"

export async function GET(req: NextRequest) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const sp = req.nextUrl.searchParams
  const cityIata = sp.get("city")
  const checkIn = sp.get("checkIn")
  const checkOut = sp.get("checkOut")
  if (!cityIata || !checkIn || !checkOut) {
    return NextResponse.json({ error: "Нужны параметры city, checkIn, checkOut" }, { status: 400 })
  }

  const params: HotelSearchParams = {
    cityIata: cityIata.toUpperCase(),
    checkIn,
    checkOut,
    adults: Number(sp.get("adults") ?? "2"),
  }
  const hotels = await searchHotels(params)
  return NextResponse.json({ hotels })
}
```

- [ ] **Step 2: Ручная проверка** (авторизованно): `?city=MOW&checkIn=2026-08-15&checkOut=2026-08-18` → JSON `{hotels:[...4 мок...]}`; без сессии — 401.
- [ ] **Step 3: Коммит**
```bash
git add app/api/modules/business-assistant/hotels/search/route.ts
git commit -m "feat(business-assistant): API поиска отелей" -- app/api/modules/business-assistant/hotels/search/route.ts
```

---

### Task 4: Страница «Отели»

**Files:** Create `app/(modules)/business-assistant/hotels/page.tsx`

Зеркало `app/(modules)/business-assistant/flights/page.tsx`. Шапка `<DashboardHeader />` БЕЗ пропсов (пропс title = ошибка типов). `<SidebarProvider defaultOpen={true}>`.

- [ ] **Step 1: Реализация**
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
import { Loader2, BedDouble, Star } from "lucide-react"

interface HotelOffer {
  id: string
  name: string
  stars: number
  ratingLabel: string | null
  priceRub: number
  nights: number
  deepLink: string
}

export default function HotelsSearchPage() {
  const [city, setCity] = useState("")
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hotels, setHotels] = useState<HotelOffer[]>([])
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    setError(null)
    if (!city || !checkIn || !checkOut) {
      setError("Заполните город, даты заезда и выезда")
      return
    }
    setLoading(true)
    try {
      const query = new URLSearchParams({ city: city.toUpperCase(), checkIn, checkOut })
      const res = await fetch(`/api/modules/business-assistant/hotels/search?${query.toString()}`)
      if (!res.ok) throw new Error("Не удалось получить результаты")
      const data = (await res.json()) as { hotels: HotelOffer[] }
      setHotels(data.hotels)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка поиска")
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BedDouble className="w-6 h-6" /> Отели
          </h1>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BedDouble className="w-5 h-5" /> Поиск отелей
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="city">Город (IATA)</Label>
                <Input id="city" placeholder="MOW" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="checkIn">Заезд</Label>
                <Input id="checkIn" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="checkOut">Выезд</Label>
                <Input id="checkOut" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
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
                <CardTitle className="text-base">Найденные отели</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hotels.length === 0 && <p className="text-sm text-muted-foreground">Ничего не найдено</p>}
                {hotels.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-1">
                        {h.name}
                        <span className="flex items-center text-amber-500">
                          {Array.from({ length: h.stars }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-current" />
                          ))}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {h.ratingLabel ? `Оценка ${h.ratingLabel} · ` : ""}{h.nights} ноч.
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold">{h.priceRub.toLocaleString("ru-RU")} ₽</div>
                        <div className="text-xs text-muted-foreground">за {h.nights} ноч.</div>
                      </div>
                      <Button asChild size="sm">
                        <a href={h.deepLink} target="_blank" rel="noopener noreferrer">Забронировать</a>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 2: Проверка в браузере** (модуль включён у тестовой компании): `/business-assistant/hotels` → форма → MOW + даты → 4 мок-отеля, отсортированы по цене, звёзды, кнопка «Забронировать» с диплинком.
- [ ] **Step 3: Коммит**
```bash
git add "app/(modules)/business-assistant/hotels/page.tsx"
git commit -m "feat(business-assistant): страница поиска отелей" -- "app/(modules)/business-assistant/hotels/page.tsx"
```

---

### Task 5: Пункт меню «Отели»

**Files:** Modify `lib/modules/registry.ts`

- [ ] **Step 1:** В записи `business_assistant` в `MODULE_REGISTRY` добавить пункт меню после «Авиабилеты»:
```typescript
      { label: 'Авиабилеты', href: '/business-assistant/flights', icon: 'Plane' },
      { label: 'Отели', href: '/business-assistant/hotels', icon: 'BedDouble' },
```
- [ ] **Step 2:** Проверить `git diff HEAD -- lib/modules/registry.ts` — только эта правка.
- [ ] **Step 3: Коммит**
```bash
git commit -m "feat(business-assistant): пункт меню «Отели»" -- lib/modules/registry.ts
```

---

### Task 6: Верификация
- [ ] tsc по новым файлам чист (`pnpm exec tsc --noEmit | grep hotels` — пусто).
- [ ] Тесты `pnpm exec tsx --test lib/business-assistant/hotels/*.test.ts` — 2/2.
- [ ] Браузер: сайдбар → «Бизнес-ассистент» → «Отели» → поиск отдаёт мок-отели (скриншот).
- [ ] `.env.local` не изменён (или временный NEXTAUTH_URL возвращён).

## Что дальше
- Ключи те же, что у авиабилетов (Travelpayouts). При появлении — реальный режим заработает без правок (кроме возможной валидации формата ответа Hotellook cache API вживую).
- Следующий подпроект: Промокоды (радар) — источники в отдельном research.
