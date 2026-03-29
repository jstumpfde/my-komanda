"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  AlertTriangle, TrendingDown, TrendingUp, Minus, Shield, Users,
  Plus, Search, ArrowUpDown, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Типы ────────────────────────────────────────────────────────────────────

interface FlightRiskScore {
  id: string
  employeeId: string
  employeeName: string | null
  department: string | null
  position: string | null
  score: number
  riskLevel: string
  trend: string
  calculatedAt: string
}

interface RetentionAction {
  id: string
  employeeId: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  dueDate: string | null
  createdAt: string
}

interface RiskSummary {
  riskDistribution: { riskLevel: string; cnt: number }[]
  activeActions: number
}

// ── Конфиг ──────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: { label: "Критический", color: "text-red-600 dark:text-red-400",     bg: "bg-red-500/15",     icon: AlertTriangle },
  high:     { label: "Высокий",     color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/15",  icon: AlertTriangle },
  medium:   { label: "Средний",     color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/15",   icon: Minus },
  low:      { label: "Низкий",      color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/15", icon: Shield },
}

const TREND_ICON: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  declining:  { icon: TrendingDown, color: "text-red-500",     label: "Ухудшается" },
  stable:     { icon: Minus,        color: "text-muted-foreground", label: "Стабильно" },
  improving:  { icon: TrendingUp,   color: "text-emerald-500", label: "Улучшается" },
}

const ACTION_COLUMNS = [
  { key: "planned",     label: "Запланировано" },
  { key: "in_progress", label: "В работе" },
  { key: "completed",   label: "Выполнено" },
]

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 dark:text-red-400",
  high:   "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  low:    "bg-muted text-muted-foreground",
}

// ── Компонент ───────────────────────────────────────────────────────────────

export default function FlightRiskPage() {
  const [scores, setScores] = useState<FlightRiskScore[]>([])
  const [actions, setActions] = useState<RetentionAction[]>([])
  const [summary, setSummary] = useState<RiskSummary | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"employees" | "actions">("employees")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [scoresRes, summaryRes, actionsRes] = await Promise.all([
        fetch(`/api/modules/hr/flight-risk${filter ? `?risk=${filter}` : ""}`),
        fetch("/api/modules/hr/flight-risk?type=summary"),
        fetch("/api/modules/hr/flight-risk/retention-actions"),
      ])
      setScores(await scoresRes.json())
      setSummary(await summaryRes.json())
      setActions(await actionsRes.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const seedDemo = async () => {
    await fetch("/api/modules/hr/flight-risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed-demo" }),
    })
    load()
  }

  const recalculate = async () => {
    await fetch("/api/cron/recalculate-flight-risk", { method: "POST" })
    load()
  }

  const moveAction = async (id: string, newStatus: string) => {
    await fetch(`/api/modules/hr/flight-risk/retention-actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    load()
  }

  // Фильтрация по поиску
  const filtered = scores.filter(s =>
    !search || (s.employeeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.department ?? "").toLowerCase().includes(search.toLowerCase())
  )

  // Сводка по уровням
  const riskCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  summary?.riskDistribution.forEach(r => { riskCounts[r.riskLevel] = Number(r.cnt) })

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Flight Risk" subtitle="Предсказание увольнений" />
        <main className="p-6 space-y-6">

          {/* ── Светофор ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["critical", "high", "medium", "low"] as const).map((level) => {
              const cfg = RISK_CONFIG[level]
              const Icon = cfg.icon
              const active = filter === level
              return (
                <button
                  key={level}
                  onClick={() => setFilter(active ? null : level)}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border transition-all",
                    active
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  <div className={cn("p-2 rounded-lg", cfg.bg)}>
                    <Icon className={cn("size-5", cfg.color)} />
                  </div>
                  <div className="text-left">
                    <p className="text-2xl font-semibold">{riskCounts[level]}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── Табы ── */}
          <div className="flex items-center gap-4 border-b border-border">
            <button
              onClick={() => setTab("employees")}
              className={cn(
                "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === "employees"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="size-4 inline mr-1.5" />
              Сотрудники ({filtered.length})
            </button>
            <button
              onClick={() => setTab("actions")}
              className={cn(
                "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === "actions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Shield className="size-4 inline mr-1.5" />
              Retention-план ({actions.length})
            </button>
            <div className="flex-1" />
            {scores.length > 0 && (
              <Button size="sm" variant="outline" onClick={recalculate}>
                Пересчитать скоры
              </Button>
            )}
            {scores.length === 0 && !loading && (
              <Button size="sm" variant="outline" onClick={seedDemo}>
                Загрузить демо
              </Button>
            )}
          </div>

          {/* ── Сотрудники ── */}
          {tab === "employees" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по имени или отделу..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {loading ? (
                <div className="text-sm text-muted-foreground py-8 text-center">Загрузка...</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Нет данных. Нажмите «Загрузить демо» для тестовых данных.
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left font-medium px-4 py-3">Сотрудник</th>
                        <th className="text-left font-medium px-4 py-3">Отдел</th>
                        <th className="text-center font-medium px-4 py-3">Балл</th>
                        <th className="text-center font-medium px-4 py-3">Уровень</th>
                        <th className="text-center font-medium px-4 py-3">Тренд</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => {
                        const cfg = RISK_CONFIG[s.riskLevel] ?? RISK_CONFIG.low
                        const trd = TREND_ICON[s.trend] ?? TREND_ICON.stable
                        const TrendIcon = trd.icon
                        return (
                          <tr key={s.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium">{s.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{s.position}</p>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{s.department}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("text-lg font-semibold", cfg.color)}>{s.score}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="secondary" className={cn(cfg.bg, cfg.color, "text-xs")}>
                                {cfg.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <TrendIcon className={cn("size-4", trd.color)} />
                                <span className={cn("text-xs", trd.color)}>{trd.label}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Retention-план (канбан) ── */}
          {tab === "actions" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ACTION_COLUMNS.map((col) => {
                const colActions = actions.filter(a => a.status === col.key)
                return (
                  <div key={col.key} className="border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground">{col.label}</h3>
                      <Badge variant="secondary" className="text-xs">{colActions.length}</Badge>
                    </div>
                    <div className="space-y-2 min-h-[100px]">
                      {colActions.map((action) => (
                        <div
                          key={action.id}
                          className="p-3 bg-background rounded-lg border border-border hover:border-primary/30 transition-colors"
                        >
                          <p className="text-sm font-medium mb-1">{action.title}</p>
                          {action.description && (
                            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{action.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className={cn("text-xs", PRIORITY_COLORS[action.priority])}>
                              {action.priority}
                            </Badge>
                            <div className="flex gap-1">
                              {col.key === "planned" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs px-2"
                                  onClick={() => moveAction(action.id, "in_progress")}
                                >
                                  В работу →
                                </Button>
                              )}
                              {col.key === "in_progress" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs px-2"
                                  onClick={() => moveAction(action.id, "completed")}
                                >
                                  Готово ✓
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {colActions.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">Пусто</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
