"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Target, Calendar, CalendarDays, CalendarRange, Plus, Star, Pencil, Trash2,
  CheckCircle2, TrendingUp, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  GoalForm,
  getHorizon,
  stripQuarterlyPrefix,
  type Horizon,
} from "@/components/goals/GoalForm"

type DbLevel = "yearly" | "monthly" | "weekly"

type Goal = {
  id: string
  userId: string
  parentId: string | null
  level: DbLevel
  title: string
  description: string | null
  targetValue: string | null
  targetUnit: string | null
  currentValue: string | null
  deadline: string | null
  isFocusToday: boolean
  status: "active" | "completed" | "paused" | "archived"
  createdAt: string
  updatedAt: string
}

const HORIZON_META: Record<Horizon, { label: string; icon: React.ElementType; accent: string }> = {
  yearly:    { label: "Годовые цели",     icon: Calendar,      accent: "text-indigo-500" },
  quarterly: { label: "Квартальные цели", icon: Sparkles,      accent: "text-sky-500" },
  monthly:   { label: "Месячные цели",    icon: CalendarRange, accent: "text-violet-500" },
  weekly:  { label: "Недельные цели", icon: CalendarDays,  accent: "text-fuchsia-500" },
}

function percent(g: Goal): number | null {
  if (!g.targetValue) return null
  const t = Number(g.targetValue), c = Number(g.currentValue ?? 0)
  if (!Number.isFinite(t) || t <= 0) return null
  return Math.max(0, Math.min(100, Math.floor((c / t) * 100)))
}

function fmtNum(v: string | null): string {
  if (v == null) return ""
  const n = Number(v)
  if (!Number.isFinite(n)) return ""
  return Number.isInteger(n) ? String(n) : n.toFixed(n % 1 < 0.01 ? 0 : 2).replace(/\.?0+$/, "")
}

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [progressFor, setProgressFor] = useState<Goal | null>(null)

  async function reload() {
    setLoading(true)
    try {
      const res = await fetch("/api/goals", { cache: "no-store" })
      if (!res.ok) {
        setGoals([])
        return
      }
      const data = await res.json()
      setGoals(Array.isArray(data.goals) ? data.goals : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const byHorizon = useMemo(() => {
    const out: Record<Horizon, Goal[]> = { yearly: [], quarterly: [], monthly: [], weekly: [] }
    for (const g of goals) {
      const h = getHorizon(g)
      out[h].push(g)
    }
    return out
  }, [goals])

  async function toggleFocus(g: Goal) {
    const next = !g.isFocusToday
    setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, isFocusToday: next } : x)))
    const res = await fetch(`/api/goals/${g.id}/focus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_focus_today: next }),
    })
    if (!res.ok) {
      toast.error("Не удалось обновить фокус")
      reload()
    } else {
      toast.success(next ? "Цель добавлена в фокус дня" : "Цель убрана из фокуса")
    }
  }

  async function remove(g: Goal) {
    if (!confirm(`Удалить цель "${g.title}"? Дочерние цели тоже удалятся.`)) return
    const res = await fetch(`/api/goals/${g.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Не удалось удалить")
      return
    }
    toast.success("Цель удалена")
    reload()
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14 max-w-6xl mx-auto w-full">

            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-500 flex items-center justify-center">
                  <Target className="size-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-foreground tracking-tight">Мои цели</h1>
                  <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                    Координатор ведёт вас от годового плана к дневному фокусу.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => { setEditing(null); setCreateOpen(true) }}
                className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 border-0"
              >
                <Plus className="size-4 mr-1" /> Новая цель
              </Button>
            </div>

            {/* Empty state */}
            {!loading && goals.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
                <Target className="size-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Целей пока нет. Начните с годовой — Координатор поможет её декомпозировать.</p>
              </div>
            )}

            {/* Levels */}
            {!loading && goals.length > 0 && (
              <div className="space-y-8">
                {(Object.keys(HORIZON_META) as Horizon[]).map((h) => {
                  const meta = HORIZON_META[h]
                  const items = byHorizon[h]
                  if (!items || items.length === 0) return null
                  const Icon = meta.icon
                  return (
                    <section key={h}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className={cn("size-4", meta.accent)} />
                        <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/80">
                          {meta.label}
                        </h2>
                        <span className="text-xs text-muted-foreground">({items.length})</span>
                      </div>
                      <div className="grid gap-3">
                        {items.map((g) => (
                          <GoalCard
                            key={g.id}
                            goal={g}
                            parents={goals}
                            onFocus={() => toggleFocus(g)}
                            onEdit={() => { setEditing(g); setCreateOpen(true) }}
                            onDelete={() => remove(g)}
                            onProgress={() => setProgressFor(g)}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Create / Edit Sheet — редизайн формы */}
      <GoalForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingGoals={goals}
        initial={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); reload() }}
      />

      {/* Progress Dialog */}
      <ProgressDialog
        goal={progressFor}
        onClose={() => setProgressFor(null)}
        onSaved={() => { setProgressFor(null); reload() }}
      />
    </SidebarProvider>
  )
}

// ─── Goal card ──────────────────────────────────────────────────────────────

function GoalCard({
  goal: g, parents, onFocus, onEdit, onDelete, onProgress,
}: {
  goal: Goal
  parents: Goal[]
  onFocus: () => void
  onEdit: () => void
  onDelete: () => void
  onProgress: () => void
}) {
  const pct = percent(g)
  const parent = parents.find((p) => p.id === g.parentId)
  const completed = g.status === "completed"
  const horizon = getHorizon(g)
  const displayDescription = stripQuarterlyPrefix(g.description)

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        completed && "border-emerald-500/40 bg-emerald-500/5",
        g.isFocusToday && !completed && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground leading-tight">
              {g.title}
            </h3>
            {horizon === "quarterly" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <Sparkles className="size-3" /> Квартальная
              </span>
            )}
            {completed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> Выполнено
              </span>
            )}
            {g.isFocusToday && !completed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Star className="size-3 fill-current" /> Фокус дня
              </span>
            )}
          </div>
          {displayDescription && (
            <p className="text-sm text-muted-foreground mt-1">{displayDescription}</p>
          )}

          {/* Progress row */}
          {g.targetValue && (
            <div className="mt-3 max-w-md">
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="text-foreground/90">
                  <span className="font-semibold">{fmtNum(g.currentValue)}</span>
                  <span className="text-muted-foreground"> / {fmtNum(g.targetValue)} {g.targetUnit ?? ""}</span>
                </span>
                {pct != null && (
                  <span className={cn("text-xs font-medium", completed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {pct}%
                  </span>
                )}
              </div>
              <Progress value={pct ?? 0} className={cn(completed && "[&>div]:bg-emerald-500")} />
            </div>
          )}

          {/* Meta */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {g.deadline && <span>до {fmtDate(g.deadline)}</span>}
            {parent && <span>↑ {parent.title}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          {g.targetValue && !completed && (
            <Button size="sm" variant="outline" onClick={onProgress} className="h-8">
              <TrendingUp className="size-3.5 mr-1" /> Прогресс
            </Button>
          )}
          <Button
            size="sm"
            variant={g.isFocusToday ? "default" : "ghost"}
            onClick={onFocus}
            className={cn("h-8", g.isFocusToday && "bg-amber-500 hover:bg-amber-600 text-white")}
            title={g.isFocusToday ? "Убрать из фокуса дня" : "В фокус на сегодня"}
          >
            <Star className={cn("size-3.5", g.isFocusToday && "fill-current")} />
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} className="h-8" title="Изменить">
            <Pencil className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 text-destructive hover:text-destructive" title="Удалить">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Progress dialog ────────────────────────────────────────────────────────

function ProgressDialog({
  goal, onClose, onSaved,
}: {
  goal: Goal | null
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (goal) setValue(goal.currentValue ?? "0")
  }, [goal])

  if (!goal) return null

  const unit = goal.targetUnit ?? ""
  const big = unit.toLowerCase().includes("млн") || unit.toLowerCase().includes("тыс")
  const stepBig = big ? 1 : 1
  const stepSmall = big ? 0.5 : 1

  async function save(explicit?: number) {
    const v = explicit ?? Number(value.replace(",", "."))
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Введите корректное число")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/goals/${goal!.id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_value: v }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d?.error ?? "Не удалось обновить прогресс")
        return
      }
      toast.success("Прогресс обновлён")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!goal} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Обновить прогресс</DialogTitle>
          <DialogDescription>{goal.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="val">Текущее значение</Label>
            <Input id="val" type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Целевое: {fmtNum(goal.targetValue)} {unit}. Сейчас: {fmtNum(goal.currentValue)} {unit}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setValue(String((Number(value) || 0) + stepSmall))}
            >
              +{stepSmall}{big ? "" : ""}
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setValue(String((Number(value) || 0) + stepBig * 5))}
            >
              +{stepBig * 5}
            </Button>
            {goal.targetValue && (
              <Button
                type="button" variant="outline" size="sm" className="ml-auto"
                onClick={() => save(Number(goal.targetValue))}
              >
                Выполнено ✓
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={() => save()} disabled={saving} className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white border-0">
            {saving ? "Сохраняю…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
