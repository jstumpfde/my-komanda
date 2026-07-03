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
  // Выразительный градиент: 7 ступеней бледный→яркий, пусто = очень светлый muted.
  const cellClass = (cnt: number) => {
    if (cnt <= 0) return "bg-muted/30"
    const r = cnt / maxCell
    if (r > 0.85) return "bg-primary"
    if (r > 0.7) return "bg-primary/85"
    if (r > 0.55) return "bg-primary/70"
    if (r > 0.4) return "bg-primary/55"
    if (r > 0.25) return "bg-primary/40"
    if (r > 0.12) return "bg-primary/25"
    return "bg-primary/10"
  }

  // 24-часовая гистограмма: суммируем grid по часам (по всем дням).
  const hourTotals = hoursAxis.map(h => grid.reduce((s, g) => (g.hour === h ? s + g.cnt : s), 0))
  const maxHourTotal = Math.max(1, ...hourTotals)
  // Порог «горячего» часа — 70% от пикового, подсветим ярче.
  const hotHourThreshold = maxHourTotal * 0.7

  // Топ-5 слотов недели (Юрий 03.07: вместо одного «лучшего» в заголовке).
  const hourRange = (h: number) =>
    `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`
  const top5 = [...grid].sort((a, b) => b.cnt - a.cnt).slice(0, 5)

  return (
    <div className="rounded-lg border p-3 space-y-3">
      {/* Заголовок: «Время откликов» — карта меряет, КОГДА кандидаты откликаются
          (не «когда публиковать»); топ-5 слотов недели вместо одного лучшего. */}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">🕐 Время откликов</p>
        {top5.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Топ-5:</span>
            {top5.map((c, i) => (
              <span key={i} className="inline-flex items-baseline gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
                <span className="font-semibold">{dayShort[c.dow]}</span>
                <span className="tabular-nums">{hourRange(c.hour)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Тепловая карта на всю ширину — отдельной строкой сверху */}
      {grid.length > 0 && (
        <div>
          {/* Шкала часов сверху — метки каждые 3 часа */}
          <div className="flex pl-8">
            {hoursAxis.map(h => (
              <div key={h} className="flex-1 text-center text-[9px] leading-none text-muted-foreground">
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          <div className="space-y-[3px] mt-1">
            {dowOrder.map(dow => (
              <div key={dow} className="flex items-center gap-[3px]">
                <div className="w-8 pr-1 text-right text-[11px] leading-none text-muted-foreground shrink-0">
                  {dayShort[dow]}
                </div>
                {hoursAxis.map(h => {
                  const cnt = cellAt(dow, h)
                  const isPeak = cnt > 0 && peakByDow.get(dow) === h
                  return (
                    <div
                      key={h}
                      title={`${dayShort[dow]} ${String(h).padStart(2, "0")}:00 — ${cnt} откл.`}
                      className={`flex-1 h-5 rounded-[3px] ${cellClass(cnt)} ${isPeak ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Под картой — друг под другом: Дни (бары), ниже 24-часовая гистограмма
          (Юрий 03.07: правую колонку опустить вниз, дизайн хромал). */}
      <div className="space-y-4 pt-1">
        {data.days && data.days.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Дни (=100%)</p>
            {data.days.slice(0, 7).map(d => (
              <div key={d.dow} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-muted-foreground truncate">{d.name}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, d.pct)}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums">{d.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {grid.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Часы (=100%)</p>
            {/* 24-часовая гистограмма: столбик на каждый час, высота = активность */}
            <div className="flex items-end gap-[2px] h-24">
              {hoursAxis.map(h => {
                const v = hourTotals[h]
                const hPct = Math.max(v > 0 ? 6 : 0, Math.round((v / maxHourTotal) * 100))
                const isHot = v > 0 && v >= hotHourThreshold
                return (
                  <div
                    key={h}
                    title={`${String(h).padStart(2, "0")}:00 — ${v} откл.`}
                    className="flex-1 flex items-end h-full"
                  >
                    <div
                      className={`w-full rounded-t-[2px] ${v <= 0 ? "bg-muted/40" : isHot ? "bg-primary" : "bg-primary/45"}`}
                      style={{ height: `${hPct}%` }}
                    />
                  </div>
                )
              })}
            </div>
            {/* Ось часов — метки каждые 6 часов */}
            <div className="flex gap-[2px]">
              {hoursAxis.map(h => (
                <div key={h} className="flex-1 text-center text-[9px] leading-none text-muted-foreground">
                  {h % 6 === 0 ? h : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        По {data.total} откликам вашей компании{data.periodDays ? ` за ${data.periodDays}д.` : ""}{firstAtLabel ? ` · с ${firstAtLabel}` : ""} · МСК{cityLabel}
      </p>
    </div>
  )
}
