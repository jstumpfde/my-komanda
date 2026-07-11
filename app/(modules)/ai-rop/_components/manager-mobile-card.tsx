"use client"

// Мобильная карточка менеджера — замена широкой таблицы «Менеджеры» на ≤768px
// (паттерн ManagerCard из ca README, см. AI-ROP-MODULE-PLAN п.14). Используется
// в дашборде: таблица рендерится только на md+, эти карточки — только на мобиле.
import { Star } from "lucide-react"
import type { ManagerStatsRow } from "@/lib/ai-rop/dashboard-data"
import { formatTotalMinutes } from "./format"

function Cell({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-1.5">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${className ?? ""}`}>{value}</div>
    </div>
  )
}

function SentimentMini({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg || 1
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${(pos / total) * 100}%` }} />
        <div className="bg-muted-foreground/50" style={{ width: `${(neu / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(neg / total) * 100}%` }} />
      </div>
      <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
        <span className="text-emerald-600 dark:text-emerald-400">+{pos}</span>
        <span>={neu}</span>
        <span className="text-red-600 dark:text-red-400">-{neg}</span>
      </div>
    </div>
  )
}

export function ManagerMobileCard({ m }: { m: ManagerStatsRow }) {
  const st = m.pos + m.neu + m.neg
  const pct = m.calls > 0 ? Math.round((m.connected / m.calls) * 100) : 0
  return (
    <div className="mb-2.5 rounded-xl border bg-card p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[15px] font-semibold">
          {m.manager_name || <span className="text-muted-foreground">ID {m.manager_id}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1 font-bold">
          {m.avg_score != null ? (
            <>
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {m.avg_score.toFixed(1)}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Всего" value={m.calls} />
        <Cell label="Контактов" value={`${m.connected} (${pct}%)`} className="text-emerald-600 dark:text-emerald-400" />
        <Cell label="Минут" value={formatTotalMinutes(m.total_seconds)} />
        <Cell label="Вход." value={m.incoming} />
        <Cell label="Исход." value={m.outgoing} />
        <Cell label="Пропущ." value={m.missed} className={m.missed > 0 ? "text-red-600 dark:text-red-400" : undefined} />
        <Cell label="Чек-лист" value={m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"} className="text-violet-600 dark:text-violet-400" />
        <Cell label="Мин. на конт." value={formatTotalMinutes(m.contact_seconds)} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      {st > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Настроение</div>
          <SentimentMini pos={m.pos} neu={m.neu} neg={m.neg} />
        </div>
      )}
    </div>
  )
}
