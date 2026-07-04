"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
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
