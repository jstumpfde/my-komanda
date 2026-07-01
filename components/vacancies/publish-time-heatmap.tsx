"use client"

import { useEffect, useState } from "react"

// ── Тепловая карта «Лучшее время публикации» ────────────────────────────────
// Презентационный компонент: рисует heatmap 7×24 (дни Пн..Вс × часы) +
// две мини-шкалы «Дни (=100%)» / «Часы (=100%)». Данные — из эндпоинта
// GET /api/modules/hr/vacancies/[id]/best-publish-time (grid/maxCell/days/hours).
// Используется в Аналитике вакансии. Карточка advisor эту карту НЕ рендерит
// (там компактный список будних слотов).

interface PublishTimeApiResponse extends PublishTimeHeatmapData {
  enough: boolean
}

// Самозагружающаяся обёртка для Аналитики вакансии: тянет тот же эндпоинт
// best-publish-time и рендерит heatmap. Пока мало данных (enough=false)
// или на ошибке — ничего не показывает.
export function PublishTimeHeatmapCard({ vacancyId, city }: { vacancyId?: string; city?: string }) {
  const [data, setData] = useState<PublishTimeApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vacancyId) { setLoading(false); return }
    let alive = true
    fetch(`/api/modules/hr/vacancies/${vacancyId}/best-publish-time`)
      .then(r => r.ok ? r.json() : null)
      .then((d: PublishTimeApiResponse | null) => { if (alive) setData(d) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vacancyId])

  if (loading || !data || !data.enough) return null
  return <PublishTimeHeatmap data={data} city={city} />
}

export interface PublishTimeHeatmapData {
  total: number
  periodDays?: number
  firstAt?: string | null
  best?: { dow: number; dayName: string; hour: number; range: string; cnt: number; pct: number } | null
  grid?: { dow: number; hour: number; cnt: number }[]
  maxCell?: number
  days?: { dow: number; name: string; cnt: number; pct: number }[]
  hours?: { hour: number; range: string; cnt: number; pct: number }[]
}

export function PublishTimeHeatmap({ data, city }: { data: PublishTimeHeatmapData; city?: string }) {
  const cityLabel = city?.trim() ? `, ${city.trim()}` : ""
  // Момент первого отклика (МСК) — «с 26.06.26 15:43».
  const firstAtLabel = data.firstAt
    ? (() => {
        try {
          return new Date(data.firstAt).toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
            day: "2-digit", month: "2-digit", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
          }).replace(",", "")
        } catch { return null }
      })()
    : null

  const grid = data.grid ?? []
  const maxCell = data.maxCell && data.maxCell > 0 ? data.maxCell : 1
  const dowOrder = [1, 2, 3, 4, 5, 6, 0] // Пн(1)..Вс(0); EXTRACT(DOW) 0=Вс..6=Сб
  const dayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
  const hoursAxis = Array.from({ length: 24 }, (_, h) => h)
  const cellAt = (dow: number, hour: number) =>
    grid.find(g => g.dow === dow && g.hour === hour)?.cnt ?? 0
  // Пик каждого дня — подсветим рамкой.
  const peakByDow = new Map<number, number>()
  for (const g of grid) {
    const cur = peakByDow.get(g.dow)
    if (cur === undefined || g.cnt > cellAt(g.dow, cur)) peakByDow.set(g.dow, g.hour)
  }
  // Одноцветный синий ramp через opacity primary (без кастомных hex).
  const cellClass = (cnt: number) => {
    if (cnt <= 0) return "bg-muted/40"
    const r = cnt / maxCell
    if (r > 0.8) return "bg-primary"
    if (r > 0.6) return "bg-primary/80"
    if (r > 0.4) return "bg-primary/60"
    if (r > 0.2) return "bg-primary/40"
    return "bg-primary/20"
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm font-semibold">
        🕐 Лучшее время публикации
        {data.best && (
          <span className="text-primary"> — {data.best.dayName}, {data.best.range}</span>
        )}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {grid.length > 0 && (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Шкала часов сверху — метки каждые 3 часа */}
              <div className="flex pl-6">
                {hoursAxis.map(h => (
                  <div key={h} className="w-[22px] text-center text-[8px] leading-none text-muted-foreground">
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
              </div>
              {dowOrder.map(dow => (
                <div key={dow} className="flex items-center">
                  <div className="w-6 pr-1 text-right text-[10px] leading-none text-muted-foreground">
                    {dayShort[dow]}
                  </div>
                  {hoursAxis.map(h => {
                    const cnt = cellAt(dow, h)
                    const isPeak = cnt > 0 && peakByDow.get(dow) === h
                    return (
                      <div
                        key={h}
                        title={`${dayShort[dow]} ${String(h).padStart(2, "0")}:00 — ${cnt} откл.`}
                        className={`w-5 h-6 m-[1px] rounded-[3px] ${cellClass(cnt)} ${isPeak ? "ring-2 ring-primary ring-offset-0" : ""}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.days && data.days.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Дни (=100%)</p>
            {data.days.slice(0, 7).map(d => (
              <div key={d.dow} className="flex items-center gap-1.5">
                <span className="w-14 shrink-0 text-[10px] text-muted-foreground truncate">{d.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, d.pct)}%` }} />
                </div>
                <span className="w-7 shrink-0 text-right text-[10px] tabular-nums">{d.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {data.hours && data.hours.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Часы (=100%)</p>
            {data.hours.slice(0, 7).map(h => (
              <div key={h.hour} className="flex items-center gap-1.5">
                <span className="w-14 shrink-0 text-[10px] text-muted-foreground truncate">{h.range}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, h.pct)}%` }} />
                </div>
                <span className="w-7 shrink-0 text-right text-[10px] tabular-nums">{h.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        По {data.total} откликам вашей компании{data.periodDays ? ` за ${data.periodDays}д.` : ""}{firstAtLabel ? ` · с ${firstAtLabel}` : ""} · МСК{cityLabel}
      </p>
    </div>
  )
}
