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
