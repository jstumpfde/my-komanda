"use client"

import { useEffect, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Plane, TrendingDown, Flame, ExternalLink, RefreshCw } from "lucide-react"

type DateMode = "exact" | "range"
type TripClass = "economy" | "business"
type StopsFilter = "any" | "nonstop" | "max1"
type TimeOfDay = "morning" | "day" | "evening" | "night"
type SortBy = "price" | "duration" | "departure"
type BaggageFilter = "any" | "checked" | "handOnly"

interface BaggageAllowance {
  handLuggage: { pieces: number; weightKg: number } | null
  checkedBaggage: { pieces: number; weightKg: number } | null
  unknown: boolean
  worstSegmentNote?: string
}

interface FlightOffer {
  id: string
  kind: "direct" | "combo"
  priceRub: number
  airlineLabel: string
  transfers: number
  durationMinutes: number | null
  savingsRub?: number
  deepLink: string
  departDate: string
  departHour: number
  cabinClass: TripClass
  baggage: BaggageAllowance
}

function formatBaggageLabel(b: BaggageAllowance): string {
  if (b.unknown) return "Багаж: уточняйте по тарифу"
  const parts: string[] = []
  parts.push(
    b.checkedBaggage
      ? `Багаж: ${b.checkedBaggage.pieces}×${b.checkedBaggage.weightKg} кг`
      : "Без багажа (только ручная кладь)",
  )
  if (b.handLuggage) parts.push(`Ручная кладь: ${b.handLuggage.pieces}×${b.handLuggage.weightKg} кг`)
  const label = parts.join(" · ")
  return b.worstSegmentNote ? `${label} (${b.worstSegmentNote})` : label
}

interface TelegramDeal {
  id: string
  routeFrom: string
  routeTo: string
  priceRub: number
  sourceChannel: string
  sourceMessageUrl: string
  rawText: string
  createdAt: string
}

const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "morning", label: "Утро (06–12)" },
  { value: "day", label: "День (12–18)" },
  { value: "evening", label: "Вечер (18–24)" },
  { value: "night", label: "Ночь (00–06)" },
]

export default function FlightsSearchPage() {
  // Основные параметры поиска
  const [origin, setOrigin] = useState("")
  const [destination, setDestination] = useState("")
  const [dateMode, setDateMode] = useState<DateMode>("exact")
  const [departDate, setDepartDate] = useState("")
  const [departDateTo, setDepartDateTo] = useState("")
  const [flexDays, setFlexDays] = useState(false)
  const [tripClass, setTripClass] = useState<TripClass>("economy")

  // Фильтры
  const [maxPrice, setMaxPrice] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay[]>([])
  const [stops, setStops] = useState<StopsFilter>("any")
  const [sortBy, setSortBy] = useState<SortBy>("price")
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([])
  const [availableAirlines, setAvailableAirlines] = useState<string[]>([])
  const [baggage, setBaggage] = useState<BaggageFilter>("any")
  const [minBaggageWeightKg, setMinBaggageWeightKg] = useState("")
  const [hideUnknownBaggage, setHideUnknownBaggage] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direct, setDirect] = useState<FlightOffer[]>([])
  const [combo, setCombo] = useState<FlightOffer[]>([])
  const [datesSearched, setDatesSearched] = useState<string[]>([])
  const [searched, setSearched] = useState(false)

  // Выбросы цен из Telegram
  const [deals, setDeals] = useState<TelegramDeal[]>([])
  const [dealsLoading, setDealsLoading] = useState(false)
  const [dealsError, setDealsError] = useState<string | null>(null)

  async function loadDeals(force = false) {
    setDealsLoading(true)
    setDealsError(null)
    try {
      const query = new URLSearchParams()
      if (force) query.set("force", "1")
      const res = await fetch(`/api/modules/business-assistant/flights/deals?${query.toString()}`)
      if (!res.ok) throw new Error("Не удалось загрузить ленту находок")
      const data = (await res.json()) as { deals: TelegramDeal[]; refreshError: string | null }
      setDeals(data.deals)
      if (data.refreshError) setDealsError(`Каналы временно недоступны: ${data.refreshError}`)
    } catch (e) {
      setDealsError(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setDealsLoading(false)
    }
  }

  useEffect(() => {
    loadDeals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildSearchQuery(): URLSearchParams | null {
    if (!origin || !destination || !departDate) {
      setError("Заполните откуда, куда и дату вылета")
      return null
    }
    if (dateMode === "range" && !flexDays && !departDateTo) {
      setError("Укажите дату «до» или включите гибкие даты ±3 дня")
      return null
    }

    const query = new URLSearchParams({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departDate,
      dateMode,
      tripClass,
      sortBy,
      stops,
    })
    if (dateMode === "range") {
      if (departDateTo) query.set("departDateTo", departDateTo)
      else if (flexDays) query.set("flexDays", "3")
    }
    if (maxPrice) query.set("maxPrice", maxPrice)
    if (timeOfDay.length > 0) query.set("timeOfDay", timeOfDay.join(","))
    if (selectedAirlines.length > 0) query.set("airlines", selectedAirlines.join(","))
    if (baggage !== "any") query.set("baggage", baggage)
    if (baggage === "checked" && minBaggageWeightKg) query.set("minBaggageWeightKg", minBaggageWeightKg)
    if (hideUnknownBaggage) query.set("hideUnknownBaggage", "1")
    return query
  }

  async function handleSearch() {
    setError(null)
    const query = buildSearchQuery()
    if (!query) return

    setLoading(true)
    try {
      const res = await fetch(`/api/modules/business-assistant/flights/search?${query.toString()}`)
      if (!res.ok) throw new Error("Не удалось получить результаты")
      const data = (await res.json()) as {
        direct: FlightOffer[]
        combo: FlightOffer[]
        airlines: string[]
        datesSearched: string[]
      }
      setDirect(data.direct)
      setCombo(data.combo)
      setAvailableAirlines(data.airlines)
      setDatesSearched(data.datesSearched)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка поиска")
    } finally {
      setLoading(false)
    }
  }

  function toggleTimeOfDay(value: TimeOfDay) {
    setTimeOfDay((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  function toggleAirline(value: string) {
    setSelectedAirlines((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Plane className="w-6 h-6" /> Авиабилеты
          </h1>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plane className="w-5 h-5" /> Поиск авиабилетов
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="origin">Откуда (IATA)</Label>
                  <Input id="origin" placeholder="MOW" value={origin} onChange={(e) => setOrigin(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="destination">Куда (IATA)</Label>
                  <Input
                    id="destination"
                    placeholder="LED"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Даты</Label>
                <Tabs value={dateMode} onValueChange={(v) => setDateMode(v as DateMode)}>
                  <TabsList>
                    <TabsTrigger value="exact">Точные даты</TabsTrigger>
                    <TabsTrigger value="range">Диапазон дат</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {dateMode === "exact" ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="departDate">Дата вылета</Label>
                    <Input
                      id="departDate"
                      type="date"
                      value={departDate}
                      onChange={(e) => setDepartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tripClass">Класс</Label>
                    <Select value={tripClass} onValueChange={(v) => setTripClass(v as TripClass)}>
                      <SelectTrigger id="tripClass"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">Эконом</SelectItem>
                        <SelectItem value="business">Бизнес</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearch} disabled={loading} className="w-full">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="departDate">Дата от</Label>
                      <Input
                        id="departDate"
                        type="date"
                        value={departDate}
                        onChange={(e) => setDepartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="departDateTo">Дата до</Label>
                      <Input
                        id="departDateTo"
                        type="date"
                        value={departDateTo}
                        disabled={flexDays}
                        onChange={(e) => setDepartDateTo(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="tripClass">Класс</Label>
                      <Select value={tripClass} onValueChange={(v) => setTripClass(v as TripClass)}>
                        <SelectTrigger id="tripClass"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="economy">Эконом</SelectItem>
                          <SelectItem value="business">Бизнес</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="flexDays"
                      checked={flexDays}
                      onCheckedChange={(v) => setFlexDays(Boolean(v))}
                    />
                    <Label htmlFor="flexDays" className="font-normal">
                      Гибкие даты — точная дата «от» ±3 дня (без даты «до»)
                    </Label>
                  </div>
                  <Button onClick={handleSearch} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти по диапазону"}
                  </Button>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>

          {searched && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Фильтры</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="maxPrice">Макс. цена, ₽</Label>
                  <Input
                    id="maxPrice"
                    type="number"
                    placeholder="Без ограничения"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="stops">Пересадки</Label>
                  <Select value={stops} onValueChange={(v) => setStops(v as StopsFilter)}>
                    <SelectTrigger id="stops"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Любые</SelectItem>
                      <SelectItem value="nonstop">Без пересадок</SelectItem>
                      <SelectItem value="max1">До 1 пересадки</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Время вылета</Label>
                  <div className="flex flex-wrap gap-3">
                    {TIME_OF_DAY_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`tod-${opt.value}`}
                          checked={timeOfDay.includes(opt.value)}
                          onCheckedChange={() => toggleTimeOfDay(opt.value)}
                        />
                        <Label htmlFor={`tod-${opt.value}`} className="font-normal text-sm">
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="sortBy">Сортировка</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                    <SelectTrigger id="sortBy"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price">По цене</SelectItem>
                      <SelectItem value="duration">По длительности</SelectItem>
                      <SelectItem value="departure">По вылету</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="baggage">Багаж</Label>
                  <Select value={baggage} onValueChange={(v) => setBaggage(v as BaggageFilter)}>
                    <SelectTrigger id="baggage"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Неважно</SelectItem>
                      <SelectItem value="checked">С багажом (≥1 место)</SelectItem>
                      <SelectItem value="handOnly">Только ручная кладь</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {baggage === "checked" && (
                  <div>
                    <Label htmlFor="minBaggageWeight">Мин. вес багажа, кг</Label>
                    <Input
                      id="minBaggageWeight"
                      type="number"
                      placeholder="Без ограничения"
                      value={minBaggageWeightKg}
                      onChange={(e) => setMinBaggageWeightKg(e.target.value)}
                    />
                  </div>
                )}
                {baggage !== "any" && (
                  <div className="flex items-center gap-2 md:col-span-2">
                    <Checkbox
                      id="hideUnknownBaggage"
                      checked={hideUnknownBaggage}
                      onCheckedChange={(v) => setHideUnknownBaggage(Boolean(v))}
                    />
                    <Label htmlFor="hideUnknownBaggage" className="font-normal text-sm">
                      Скрывать предложения без данных о багаже (иначе оставляем с пометкой «багаж не указан»)
                    </Label>
                  </div>
                )}
                {availableAirlines.length > 0 && (
                  <div className="md:col-span-2">
                    <Label className="mb-2 block">Авиакомпания</Label>
                    <div className="flex flex-wrap gap-3">
                      {availableAirlines.map((airline) => (
                        <div key={airline} className="flex items-center gap-2">
                          <Checkbox
                            id={`airline-${airline}`}
                            checked={selectedAirlines.includes(airline)}
                            onCheckedChange={() => toggleAirline(airline)}
                          />
                          <Label htmlFor={`airline-${airline}`} className="font-normal text-sm">
                            {airline}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="md:col-span-2">
                  <Button onClick={handleSearch} disabled={loading} variant="secondary">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Применить фильтры"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {searched && datesSearched.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Опрошены даты: {datesSearched.join(", ")}
            </p>
          )}

          {searched && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Обычные рейсы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {direct.length === 0 && <p className="text-sm text-muted-foreground">Ничего не найдено</p>}
                {direct.map((offer) => (
                  <OfferRow key={offer.id} offer={offer} showDate={datesSearched.length > 1} />
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
                  <OfferRow key={offer.id} offer={offer} showDate={datesSearched.length > 1} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" /> Выбросы цен из Telegram
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => loadDeals(true)} disabled={dealsLoading}>
                {dealsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1" /> Обновить
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {dealsError && <p className="text-sm text-amber-600 mb-2">{dealsError}</p>}
              {!dealsLoading && deals.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Пока пусто — каналы ещё не опрошены или не нашлось находок с распознанной ценой.
                </p>
              )}
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Badge variant="outline">{deal.sourceChannel}</Badge>
                      {deal.routeFrom !== "?" && deal.routeTo !== "?" && (
                        <span>
                          {deal.routeFrom} → {deal.routeTo}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{deal.rawText}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="font-semibold whitespace-nowrap">{deal.priceRub.toLocaleString("ru-RU")} ₽</div>
                    <Button asChild size="sm" variant="outline">
                      <a href={deal.sourceMessageUrl} target="_blank" rel="noopener noreferrer">
                        Открыть пост <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function OfferRow({ offer, showDate }: { offer: FlightOffer; showDate: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
      <div>
        <div className="font-medium text-sm">{offer.airlineLabel}</div>
        <div className="text-xs text-muted-foreground">
          {showDate && `${offer.departDate} · `}
          {offer.transfers === 0 ? "прямой" : `${offer.transfers} пересадк${offer.transfers === 1 ? "а" : "и"}`}
          {offer.durationMinutes ? ` · ${Math.floor(offer.durationMinutes / 60)} ч ${offer.durationMinutes % 60} мин` : ""}
          {offer.cabinClass === "business" ? " · бизнес" : ""}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          {formatBaggageLabel(offer.baggage)}
          {offer.baggage.unknown && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              багаж не указан
            </Badge>
          )}
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
