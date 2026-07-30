/**
 * Локальные UI-хелперы страницы «Динамика по менеджерам» (dynamics/page.tsx).
 * Только эта страница их использует — не выносить в общие _components модуля.
 *
 * Всё здесь — server-safe (никакой интерактивности, кроме нативных SVG
 * <title> тултипов), поэтому "use client" не нужен.
 */
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ManagerDynamics, SkillDelta } from "@/lib/ai-rop/team-dynamics"

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

/** Дата начала периода (сегодня минус weeksCount*7 дней), формат ДД.ММ.ГГГГ. */
export function formatPeriodStart(weeksCount: number): string {
  const today = new Date()
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - weeksCount * 7)
  const dd = String(from.getUTCDate()).padStart(2, "0")
  const mm = String(from.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = from.getUTCFullYear()
  return `${dd}.${mm}.${yyyy}`
}

/** "2026-05-12" (понедельник недели) → "12.05" для подписи под спарклайном. */
function formatWeekShort(weekKey: string): string {
  const [, mm, dd] = weekKey.split("-")
  return `${dd}.${mm}`
}

const VERDICT_META: Record<
  ManagerDynamics["verdict"],
  { label: string; icon: typeof TrendingUp; badgeClass: string; barClass: string; textClass: string }
> = {
  growing: {
    label: "Растёт",
    icon: TrendingUp,
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    barClass: "fill-emerald-500",
    textClass: "text-emerald-700 dark:text-emerald-400",
  },
  stuck: {
    label: "Застрял",
    icon: Minus,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    barClass: "fill-amber-500",
    textClass: "text-amber-700 dark:text-amber-400",
  },
  declining: {
    label: "Просел",
    icon: TrendingDown,
    badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
    barClass: "fill-red-500",
    textClass: "text-red-700 dark:text-red-400",
  },
  insufficient: {
    label: "Мало данных",
    icon: Minus,
    badgeClass: "bg-muted text-muted-foreground border-transparent",
    barClass: "fill-muted-foreground",
    textClass: "text-muted-foreground",
  },
}

/** Простой недельный спарклайн (SVG-бары), без recharts. Тултип — нативный <title>. */
function Sparkline({ weeks, barClass }: { weeks: ManagerDynamics["weeks"]; barClass: string }) {
  if (weeks.length === 0) return null
  const barW = 10
  const gap = 4
  const height = 40
  const width = weeks.length * barW + Math.max(0, weeks.length - 1) * gap

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block overflow-visible"
      role="img"
      aria-label="Недельная динамика выполнения чек-листа"
    >
      {weeks.map((w, i) => {
        const h = Math.max(2, Math.round(w.compliance * height))
        const x = i * (barW + gap)
        const y = height - h
        return (
          <rect key={w.week} x={x} y={y} width={barW} height={h} rx={2} className={cn(barClass, "opacity-70")}>
            <title>{`Неделя ${formatWeekShort(w.week)}: ${pct(w.compliance)}, ${w.calls} зв.`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function SkillDeltaList({
  title,
  icon: Icon,
  colorClass,
  items,
  emptyText,
  mode,
}: {
  title: string
  icon: typeof ArrowUp
  colorClass: string
  items: SkillDelta[]
  emptyText: string
  mode: "improved" | "regressed"
}) {
  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        <Icon className={cn("h-3.5 w-3.5", colorClass)} />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((s) => (
            <li key={s.title} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate" title={s.title}>{s.title}</span>
              <span className={cn("shrink-0 font-semibold tabular-nums text-xs", colorClass)}>
                {mode === "improved" ? `+${Math.round(s.delta * 100)}%` : pct(s.recent)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ManagerCard({ m }: { m: ManagerDynamics }) {
  const meta = VERDICT_META[m.verdict]
  const Icon = meta.icon

  if (m.verdict === "insufficient") {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{m.name}</span>
            <span className="text-sm text-muted-foreground">{m.calls} звонков</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn("gap-1", meta.badgeClass)}>
              <Icon className="h-3.5 w-3.5" /> {meta.label}
            </Badge>
            <span className="text-sm text-muted-foreground">Меньше 2 недель данных для вердикта</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-base">{m.name}</span>
            <span className="text-sm text-muted-foreground">{m.calls} звонков</span>
          </div>
          <Badge variant="outline" className={cn("gap-1", meta.badgeClass)}>
            <Icon className="h-3.5 w-3.5" /> {meta.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-baseline gap-2 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">Чек-лист:</span>
            <span className="font-semibold tabular-nums">{pct(m.earlyCompliance)}</span>
            <span className="text-muted-foreground">→</span>
            <span className={cn("font-semibold tabular-nums", meta.textClass)}>{pct(m.recentCompliance)}</span>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Sparkline weeks={m.weeks} barClass={meta.barClass} />
            {m.weeks.length > 0 && (
              <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
                <span>{formatWeekShort(m.weeks[0].week)}</span>
                <span>сейчас · {m.weeks.length} нед.</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-3 border-t">
          <SkillDeltaList
            title="Подтянул"
            icon={ArrowUp}
            colorClass="text-emerald-600 dark:text-emerald-400"
            items={m.improved}
            emptyText="Заметного роста навыков пока нет"
            mode="improved"
          />
          <SkillDeltaList
            title="Застрял"
            icon={ArrowDown}
            colorClass="text-amber-600 dark:text-amber-400"
            items={m.regressed}
            emptyText="Слабых застрявших навыков нет"
            mode="regressed"
          />
        </div>
      </CardContent>
    </Card>
  )
}
