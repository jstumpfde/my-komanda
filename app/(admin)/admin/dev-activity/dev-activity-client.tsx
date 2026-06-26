"use client"

import { useMemo, useState } from "react"
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RefreshCw, Loader2, AlertTriangle, GitBranch, ChevronRight } from "lucide-react"
import type { DevActivityDay, DayTask, RepoDayStat, Substance, Verdict, RecentCommit } from "@/lib/dev-activity/types"
import { pagesForProject, type ProjectPage } from "@/lib/dev-activity/project-pages"

interface RepoState { label: string; branch: string | null; wip: number; unpushed: number; commits: number }
interface SeriesData {
  person: string
  days: DevActivityDay[]
  repoStates: RepoState[]
  recent: RecentCommit[]
  lastCollectedAt: string | null
}

const VERDICT: Record<Verdict, { label: string; badge: string; fill: string }> = {
  silence: { label: "🔇 Тишина",        badge: "bg-slate-100 text-slate-600 border-slate-200",     fill: "#cbd5e1" },
  below:   { label: "🔴 Ниже нормы",    badge: "bg-red-100 text-red-700 border-red-200",           fill: "#ef4444" },
  normal:  { label: "🟢 Норма",         badge: "bg-emerald-100 text-emerald-700 border-emerald-200", fill: "#10b981" },
  above:   { label: "🔵 Выше нормы",    badge: "bg-blue-100 text-blue-700 border-blue-200",        fill: "#3b82f6" },
  warmup:  { label: "Набор статистики", badge: "bg-slate-100 text-slate-500 border-slate-200",     fill: "#94a3b8" },
}

const KIND: Record<Substance, { label: string; cls: string }> = {
  substantial: { label: "Крупная", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  normal:      { label: "Обычная", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  trivial:     { label: "Мелочь",  cls: "bg-slate-50 text-slate-400 border-slate-200" },
}

function ddmm(day: string): string {
  const [, m, d] = day.split("-")
  return `${d}.${m}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return "ещё не собирали"
  const d = new Date(iso)
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function VerdictBadge({ v }: { v: Verdict | null }) {
  const meta = VERDICT[v ?? "warmup"]
  return <Badge variant="outline" className={cn("font-medium", meta.badge)}>{meta.label}</Badge>
}

export function DevActivityClient({ initial, personLabel }: { initial: SeriesData; personLabel: string }) {
  const [data, setData] = useState<SeriesData>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<string>("__all__")

  async function collectNow() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/platform/dev-activity", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Ошибка сбора")
      setData(json.data as SeriesData)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const days = data.days
  const today = days.length ? days[days.length - 1] : null
  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const d of days) for (const r of d.repos) set.add(r.repo)
    return [...set].sort()
  }, [days])

  // График: последние 30 дней.
  const chart = useMemo(() => days.slice(-30).map(d => ({
    label: ddmm(d.day),
    score: d.score,
    verdict: (d.verdict ?? "warmup") as Verdict,
    tasks: d.taskCount,
    commits: d.commitCount,
  })), [days])

  const baseline = useMemo(() => {
    for (let i = days.length - 1; i >= 0; i--) if (days[i].baseline != null) return days[i].baseline
    return null
  }, [days])

  // Журнал: дни с активностью, по убыванию; при фильтре — только нужный проект.
  const journal = useMemo(() => {
    const active = days.filter(d => d.commitCount > 0).slice().reverse()
    if (project === "__all__") return active
    return active
      .filter(d => d.repos.some(r => r.repo === project))
      .map(d => ({ ...d, tasks: d.tasks.filter(t => t.repo === project), repos: d.repos.filter(r => r.repo === project) }))
  }, [days, project])

  return (
    <div className="p-6 max-w-6xl space-y-5">
      {/* Шапка */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">Dev-активность — {personLabel}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Журнал продуктивности по коммитам и работе на сервере. Обновлено: {fmtTime(data.lastCollectedAt)}
          </p>
        </div>
        <Button onClick={collectNow} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Собираю…" : "Собрать сейчас"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {!today ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Данных пока нет. Нажмите «Собрать сейчас» — соберём активность за последние дни.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Вердикт за сегодня */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Сегодня — {ddmm(today.day)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <VerdictBadge v={today.verdict} />
                <span className="text-sm text-muted-foreground">
                  Задач: <b className="text-foreground">{today.taskCount}</b> ·
                  балл <b className="text-foreground">{today.score}</b>
                  {baseline != null && <> · норма ≈ {Math.round(baseline * 10) / 10}</>} ·
                  коммитов {today.commitCount} ·
                  <span className="text-emerald-600"> +{today.linesAdded}</span>/<span className="text-red-500">−{today.linesRemoved}</span>
                </span>
                {today.wipFiles > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    незакоммичено: {today.wipFiles} файл.
                  </Badge>
                )}
              </div>
              {today.summary
                ? <p className="text-sm">{today.summary}</p>
                : <p className="text-sm text-muted-foreground">Сегодня коммитов ещё не было.</p>}
            </CardContent>
          </Card>

          {/* Лента «что катит сейчас» */}
          <RecentFeed items={data.recent} />

          {/* График + проекты сейчас */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Продуктивность за 30 дней</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
                    {baseline != null && (
                      <ReferenceLine y={baseline} stroke="#10b981" strokeDasharray="4 4"
                        label={{ value: "норма", position: "right", fontSize: 10, fill: "#10b981" }} />
                    )}
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {chart.map((c, i) => <Cell key={i} fill={VERDICT[c.verdict].fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                  {(["above", "normal", "below", "silence"] as Verdict[]).map(v => (
                    <span key={v} className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: VERDICT[v].fill }} />
                      {VERDICT[v].label.replace(/^.\s/, "")}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Проекты</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {data.repoStates.length === 0 && <p className="text-xs text-muted-foreground">Нет данных</p>}
                {data.repoStates.map(r => <ProjectRow key={r.label} repo={r} />)}
              </CardContent>
            </Card>
          </div>

          {/* Фильтр по проекту */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={project === "__all__"} onClick={() => setProject("__all__")}>Все проекты</FilterChip>
            {projects.map(p => (
              <FilterChip key={p} active={project === p} onClick={() => setProject(p)}>{p}</FilterChip>
            ))}
          </div>

          {/* Журнал */}
          <div className="space-y-3">
            {journal.length === 0 && (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Нет дней с активностью по этому проекту.</CardContent></Card>
            )}
            {journal.map(d => <DayCard key={d.day} day={d} />)}
          </div>
        </>
      )}
    </div>
  )
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { verdict: Verdict; score: number; tasks: number; commits: number } }>; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="font-medium mb-0.5">{label} · {VERDICT[p.verdict].label}</div>
      <div className="text-muted-foreground">балл {p.score} · задач {p.tasks} · коммитов {p.commits}</div>
    </div>
  )
}

function ProjectRow({ repo }: { repo: RepoState }) {
  const [open, setOpen] = useState(false)
  const pages = pagesForProject(repo.label)
  const hasPages = pages.length > 0

  // Группируем страницы по group (если задана) — для подзаголовков внутри проекта.
  const groups = useMemo(() => {
    const map = new Map<string, ProjectPage[]>()
    for (const p of pages) {
      const g = p.group ?? ""
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    return [...map.entries()]
  }, [pages])

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => hasPages && setOpen(o => !o)}
        disabled={!hasPages}
        className={cn(
          "w-full flex items-center justify-between gap-2 text-sm py-2 text-left",
          hasPages ? "cursor-pointer hover:opacity-80" : "cursor-default",
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasPages && (
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{repo.label}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> {repo.branch ?? "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {repo.wip > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5">WIP {repo.wip}</Badge>}
          {repo.unpushed > 0 && <Badge variant="outline" className="bg-slate-50 text-slate-500 text-[10px] px-1.5">↑{repo.unpushed}</Badge>}
        </div>
      </button>
      {open && hasPages && (
        <div className="pb-2.5 pl-5 space-y-2">
          {groups.map(([g, items]) => (
            <div key={g} className="space-y-0.5">
              {g && <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mt-1.5">{g}</div>}
              {items.map(p => (
                <div key={p.label + p.path} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-foreground/90">{p.label}</span>
                  <code className="text-[10px] text-muted-foreground/70 shrink-0 truncate max-w-[55%]">{p.path}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("px-3 py-1 rounded-full text-xs border transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  )
}

function RecentFeed({ items }: { items: RecentCommit[] }) {
  if (!items || items.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Что катит сейчас · последние коммиты (48 ч)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-sm border-b last:border-0 pb-1.5 last:pb-0">
            <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-[88px]">{fmtClock(c.at)}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{c.repo}</Badge>
            <span className="min-w-0 flex-1">{c.subject}</span>
            <span className="text-[11px] shrink-0">
              <span className="text-emerald-600">+{c.added}</span>/<span className="text-red-500">−{c.removed}</span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function DayCard({ day }: { day: DevActivityDay }) {
  const tasks: DayTask[] = day.tasks
  const repos: RepoDayStat[] = day.repos
  return (
    <Card>
      <CardContent className="py-4 space-y-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold">{ddmm(day.day)}</span>
          <VerdictBadge v={day.verdict} />
          <span className="text-xs text-muted-foreground">
            задач {day.taskCount} · балл {day.score} · коммитов {day.commitCount} ·
            <span className="text-emerald-600"> +{day.linesAdded}</span>/<span className="text-red-500">−{day.linesRemoved}</span>
          </span>
        </div>
        {day.summary && <p className="text-sm">{day.summary}</p>}
        {tasks.length > 0 && (
          <ul className="space-y-1.5">
            {tasks.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{t.repo}</Badge>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 shrink-0", KIND[t.kind].cls)}>{KIND[t.kind].label}</Badge>
                <span className="min-w-0">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
        {repos.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-muted-foreground">
            {repos.map(r => <span key={r.repo}>{r.repo}: {r.commits} ком. (+{r.added}/−{r.removed})</span>)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
