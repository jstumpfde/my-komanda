// Презентационные (без интерактивности) секции публичного отчёта AI-РОП.
// Локальная копия разметки дашборда — сознательно НЕ импортирует из чужой
// зоны app/(modules)/ai-rop/{page.tsx,_components,...}/** (см. задачу фазы 4b).
// Источник данных — единый lib/ai-rop/dashboard-data.ts (тот же, что использует
// приватный кабинет), поэтому цифры совпадают 1:1.

import type { DashboardData, DailyRow, ManagerStatsRow, ProductStatsRow } from "@/lib/ai-rop/dashboard-data"

// ─── Обёртки ────────────────────────────────────────────────────────────────

export function SectionCard({ title, tv, children }: { title: string; tv?: boolean; children: React.ReactNode }) {
  return (
    <div className={`border rounded-xl bg-card shadow-sm ${tv ? "p-8" : "p-5 sm:p-6"}`}>
      <h3 className={`${tv ? "text-2xl mb-5" : "text-base mb-4"} font-semibold`}>{title}</h3>
      {children}
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{text}</p>
}

// ─── KPI ────────────────────────────────────────────────────────────────────

const KPI_COLORS: Record<string, string> = {
  blue:    "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 sm:bg-blue-500 sm:text-white dark:sm:bg-blue-500 dark:sm:text-white",
  emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 sm:bg-emerald-500 sm:text-white dark:sm:bg-emerald-500 dark:sm:text-white",
  violet:  "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 sm:bg-violet-500 sm:text-white dark:sm:bg-violet-500 dark:sm:text-white",
  indigo:  "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 sm:bg-indigo-500 sm:text-white dark:sm:bg-indigo-500 dark:sm:text-white",
  amber:   "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 sm:bg-amber-500 sm:text-white dark:sm:bg-amber-500 dark:sm:text-white",
  rose:    "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 sm:bg-rose-500 sm:text-white dark:sm:bg-rose-500 dark:sm:text-white",
}

export function KpiCard({
  icon: Icon, label, shortLabel, value, color, tv,
}: {
  icon: React.ElementType; label: string; shortLabel?: string; value: number | string; color: keyof typeof KPI_COLORS; tv?: boolean
}) {
  return (
    <div className={`rounded-xl shadow-sm ${tv ? "p-6" : "p-3 sm:p-4"} ${KPI_COLORS[color]}`}>
      <div className={`flex items-center gap-1.5 ${tv ? "mb-2" : "mb-1 sm:mb-2"}`}>
        <Icon className={tv ? "w-6 h-6" : "w-4 h-4 shrink-0"} />
        <span className={`font-semibold leading-tight ${tv ? "text-lg" : "text-xs sm:text-sm"}`}>
          {shortLabel ? (<><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></>) : label}
        </span>
      </div>
      <p className={`font-bold tabular-nums ${tv ? "text-6xl" : "text-2xl sm:text-3xl"}`}>{value}</p>
    </div>
  )
}

// ─── Форматирование ─────────────────────────────────────────────────────────

export function formatMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round((totalSeconds || 0) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} ч ${minutes} мин`
  return `${minutes} мин`
}

export function formatScore(v: number | null): string {
  return v == null ? "—" : (Math.round(v * 10) / 10).toString()
}

export function formatPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`
}

// ─── Таблица по менеджерам (десктоп-таблица + мобильные карточки ≤768px) ────

export function ManagerTable({ rows }: { rows: ManagerStatsRow[] }) {
  if (rows.length === 0) return <EmptyState text="Пока нет звонков по менеджерам за выбранный период" />

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="text-left font-medium py-2 pr-3">Менеджер</th>
              <th className="text-center font-medium py-2 px-2">Звонков</th>
              <th className="text-center font-medium py-2 px-2">На связи</th>
              <th className="text-center font-medium py-2 px-2">Пропущено</th>
              <th className="text-center font-medium py-2 px-2">Минут</th>
              <th className="text-center font-medium py-2 px-2">Ср. оценка</th>
              <th className="text-center font-medium py-2 px-2">Чек-лист</th>
              <th className="text-center font-medium py-2 pl-2">Настроение</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.manager_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="py-2.5 pr-3 font-medium truncate max-w-[220px]">{r.manager_name?.trim() || `ID ${r.manager_id}`}</td>
                <td className="py-2.5 px-2 text-center tabular-nums">{r.calls}</td>
                <td className="py-2.5 px-2 text-center tabular-nums text-muted-foreground">{r.connected}</td>
                <td className="py-2.5 px-2 text-center tabular-nums text-rose-500">{r.missed}</td>
                <td className="py-2.5 px-2 text-center tabular-nums text-muted-foreground">{formatMinutes(r.total_seconds)}</td>
                <td className="py-2.5 px-2 text-center tabular-nums font-medium">{formatScore(r.avg_score)}</td>
                <td className="py-2.5 px-2 text-center tabular-nums">{formatPct(r.avg_compliance)}</td>
                <td className="py-2.5 pl-2"><SentimentMini pos={r.pos} neu={r.neu} neg={r.neg} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.manager_id} className="rounded-xl border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm truncate">{r.manager_name?.trim() || `ID ${r.manager_id}`}</span>
              <SentimentMini pos={r.pos} neu={r.neu} neg={r.neg} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Звонков", value: r.calls },
                { label: "На связи", value: r.connected },
                { label: "Пропущено", value: r.missed },
                { label: "Минут", value: formatMinutes(r.total_seconds) },
                { label: "Оценка", value: formatScore(r.avg_score) },
                { label: "Чек-лист", value: formatPct(r.avg_compliance) },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-muted/30 px-2 py-1.5 text-center">
                  <div className="text-[10px] text-muted-foreground leading-none mb-1">{m.label}</div>
                  <div className="text-sm font-medium tabular-nums">{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SentimentMini({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-1 justify-center" title={`Позитив ${pos} · Нейтрально ${neu} · Негатив ${neg}`}>
      <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{pos}</span>
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />{neu}</span>
      <span className="inline-flex items-center gap-0.5 text-[11px] text-rose-600"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />{neg}</span>
    </div>
  )
}

// ─── Динамика за 14 дней ─────────────────────────────────────────────────────

export function TrendChart({ series, maxDaily, tv }: { series: DailyRow[]; maxDaily: number; tv?: boolean }) {
  const hasData = series.some((d) => d.total > 0)
  if (!hasData) return <EmptyState text="Нет звонков за последние 14 дней" />

  return (
    <div className={`flex items-end gap-1.5 ${tv ? "h-40" : "h-28"}`}>
      {series.map((d) => {
        const h = Math.max(2, Math.round((d.total / maxDaily) * 100))
        const dateLabel = `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}`
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
            <div
              className="w-full rounded-t bg-violet-400 dark:bg-violet-600 transition-all"
              style={{ height: `${h}%` }}
              title={`${dateLabel}: ${d.total} звонков (+${d.positive}/-${d.negative})`}
            />
            <span className="text-[9px] text-muted-foreground whitespace-nowrap rotate-0">{dateLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Настроение заказчиков ───────────────────────────────────────────────────

export function SentimentBlock({ sentMap, sentTotal }: { sentMap: DashboardData["sentMap"]; sentTotal: number }) {
  if (sentTotal === 0) return <EmptyState text="Нет данных о настроении за период" />

  const rows: Array<{ label: string; key: keyof DashboardData["sentMap"]; cls: string; barCls: string }> = [
    { label: "Позитив", key: "positive", cls: "text-emerald-600", barCls: "bg-emerald-500" },
    { label: "Нейтрально", key: "neutral", cls: "text-muted-foreground", barCls: "bg-muted-foreground/50" },
    { label: "Негатив", key: "negative", cls: "text-rose-600", barCls: "bg-rose-500" },
  ]

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const v = sentMap[r.key]
        const pct = sentTotal > 0 ? Math.round((v / sentTotal) * 100) : 0
        return (
          <div key={r.key}>
            <div className="flex items-center justify-between mb-1 text-sm">
              <span className={r.cls}>{r.label}</span>
              <span className="font-semibold tabular-nums">{v} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
            </div>
            <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${r.barCls}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Слабые места чек-листа ───────────────────────────────────────────────────

export function ChecklistWeak({ items }: { items: DashboardData["checklistItemsBreakdown"] }) {
  if (items.length === 0) return <EmptyState text="Пока нет данных по чек-листу" />
  const top = items.slice(0, 5)

  return (
    <div className="space-y-3">
      {top.map((it) => {
        const pct = Math.round(it.pass_rate * 100)
        const barCls = pct < 50 ? "bg-rose-500" : pct < 75 ? "bg-amber-500" : "bg-emerald-500"
        return (
          <div key={it.id}>
            <div className="flex items-center justify-between mb-1 text-sm">
              <span className="truncate pr-2">{it.title}</span>
              <span className="font-semibold tabular-nums shrink-0">{pct}%</span>
            </div>
            <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Топ возражений и тем ─────────────────────────────────────────────────────

export function TopChips({
  objections, topics,
}: { objections: DashboardData["topObjections"]; topics: DashboardData["topTopics"] }) {
  if (objections.length === 0 && topics.length === 0) return <EmptyState text="Возражений и тем ещё не найдено" />

  return (
    <div className="space-y-4">
      {objections.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Возражения</p>
          <div className="flex flex-wrap gap-1.5">
            {objections.map((o) => (
              <span key={o.title} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
                {o.title} <span className="font-semibold">{o.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {topics.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Темы разговоров</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <span key={t.title} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900 text-violet-700 dark:text-violet-300">
                {t.title} <span className="font-semibold">{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Распределение по продуктам ──────────────────────────────────────────────

function productLabel(p: string | null): string {
  if (p === "__no_match__") return "Без совпадения"
  if (p === "__no_transcript__") return "Без транскрипта"
  return p?.trim() || "Не определён"
}

export function ProductTable({ rows }: { rows: ProductStatsRow[] }) {
  const meaningful = rows.filter((r) => r.calls > 0)
  if (meaningful.length === 0) return <EmptyState text="Нет данных по продуктам за период" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="text-left font-medium py-2 pr-3">Продукт</th>
            <th className="text-center font-medium py-2 px-2">Звонков</th>
            <th className="text-center font-medium py-2 px-2">На связи</th>
            <th className="text-center font-medium py-2 px-2">Ср. оценка</th>
            <th className="text-center font-medium py-2 pl-2">Настроение</th>
          </tr>
        </thead>
        <tbody>
          {meaningful.map((r) => (
            <tr key={r.product ?? "null"} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
              <td className="py-2.5 pr-3 font-medium truncate max-w-[220px]">{productLabel(r.product)}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.calls}</td>
              <td className="py-2.5 px-2 text-center tabular-nums text-muted-foreground">{r.connected}</td>
              <td className="py-2.5 px-2 text-center tabular-nums font-medium">{formatScore(r.avg_score)}</td>
              <td className="py-2.5 pl-2"><SentimentMini pos={r.pos} neu={r.neu} neg={r.neg} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
