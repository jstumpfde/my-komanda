"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Sun, Sparkles, Star, CheckCircle2, Target, Calendar, CalendarDays, CalendarRange,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Level = "yearly" | "monthly" | "weekly"

type Goal = {
  id: string
  level: Level
  title: string
  description: string | null
  targetValue: string | null
  targetUnit: string | null
  currentValue: string | null
  deadline: string | null
  isFocusToday: boolean
  status: "active" | "completed" | "paused" | "archived"
}

const LEVEL_META: Record<Level, { label: string; icon: React.ElementType; accent: string }> = {
  weekly:  { label: "Эта неделя", icon: CalendarDays,  accent: "text-fuchsia-500" },
  monthly: { label: "Этот месяц", icon: CalendarRange, accent: "text-violet-500" },
  yearly:  { label: "Этот год",   icon: Calendar,      accent: "text-indigo-500" },
}

function getGreeting(d: Date): string {
  const h = d.getHours()
  if (h < 6) return "Доброй ночи"
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

function fmtLongDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
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

export default function MorningBriefPage() {
  const { data: session } = useSession()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loadingGoals, setLoadingGoals] = useState(true)
  const [commentary, setCommentary] = useState<string>("")
  const [generatedAt, setGeneratedAt] = useState<string>("")
  const [loadingAi, setLoadingAi] = useState(true)

  const today = useMemo(() => new Date(), [])
  const firstName = (session?.user?.name ?? "").split(" ")[0] || "коллега"

  async function loadGoals() {
    setLoadingGoals(true)
    try {
      const res = await fetch("/api/goals?status=active", { cache: "no-store" })
      const data = await res.json()
      setGoals(Array.isArray(data.goals) ? data.goals : [])
    } catch {
      setGoals([])
    } finally {
      setLoadingGoals(false)
    }
  }

  async function loadCommentary(force = false) {
    setLoadingAi(true)
    const userId = session?.user?.id
    const hour = new Date().toISOString().slice(0, 13) // yyyy-mm-ddThh
    const cacheKey = userId ? `morning_brief_commentary_${userId}_${hour}` : null

    if (!force && cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached) as { commentary: string; generated_at: string }
          setCommentary(parsed.commentary)
          setGeneratedAt(parsed.generated_at)
          setLoadingAi(false)
          return
        }
      } catch {}
    }

    try {
      const res = await fetch("/api/morning-brief/commentary", { method: "POST" })
      if (!res.ok) throw new Error("fail")
      const data = await res.json() as { commentary: string; generated_at: string }
      setCommentary(data.commentary)
      setGeneratedAt(data.generated_at)
      if (cacheKey) {
        try { localStorage.setItem(cacheKey, JSON.stringify(data)) } catch {}
      }
    } catch {
      setCommentary("Утренний обзор готов. Посмотрите фокус дня и прогресс по целям ниже.")
      setGeneratedAt(new Date().toISOString())
    } finally {
      setLoadingAi(false)
    }
  }

  useEffect(() => { loadGoals() }, [])
  useEffect(() => { if (session?.user?.id) loadCommentary() }, [session?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const focusToday = goals.filter((g) => g.isFocusToday)
  const byLevel: Record<Level, Goal[]> = {
    yearly: goals.filter((g) => g.level === "yearly"),
    monthly: goals.filter((g) => g.level === "monthly"),
    weekly: goals.filter((g) => g.level === "weekly"),
  }

  async function markDone(g: Goal) {
    if (!g.targetValue) return
    const res = await fetch(`/api/goals/${g.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_value: Number(g.targetValue) }),
    })
    if (!res.ok) { toast.error("Не удалось обновить"); return }
    toast.success("Цель отмечена как выполненная")
    loadGoals()
  }

  async function incrementProgress(g: Goal) {
    if (!g.targetValue) return
    const current = Number(g.currentValue ?? 0)
    const target = Number(g.targetValue)
    const unit = (g.targetUnit ?? "").toLowerCase()
    const step = unit.includes("млн") || unit.includes("тыс") ? 0.5 : 1
    const next = Math.min(current + step, target)
    const res = await fetch(`/api/goals/${g.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_value: next }),
    })
    if (!res.ok) { toast.error("Не удалось обновить"); return }
    toast.success(`Прогресс: +${step}`)
    loadGoals()
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14 max-w-4xl mx-auto w-full space-y-6">

            {/* Greeting */}
            <header className="flex items-start gap-4">
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/30 to-orange-400/20 text-amber-500 flex items-center justify-center">
                <Sun className="size-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground capitalize">{fmtLongDate(today)}</p>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight mt-0.5">
                  {getGreeting(today)}, {firstName}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Ваш утренний обзор</p>
              </div>
            </header>

            {/* Focus today */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Star className="size-4 text-amber-500 fill-amber-500" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/80">
                  Ваш фокус сегодня
                </h2>
              </div>

              {focusToday.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>
                    Откройте раздел <span className="font-medium text-foreground">«Мои цели»</span> и поставьте звёздочку напротив 1–3 целей —
                    они будут вашим фокусом дня.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/goals"><Target className="size-4 mr-1" /> Перейти к целям</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {focusToday.map((g) => {
                    const pct = percent(g)
                    const completed = g.status === "completed"
                    return (
                      <div key={g.id} className={cn(
                        "rounded-lg border p-3",
                        completed ? "border-emerald-500/40 bg-emerald-500/5" : "border-border",
                      )}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-foreground">{g.title}</h3>
                            {g.targetValue && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {fmtNum(g.currentValue)} / {fmtNum(g.targetValue)} {g.targetUnit ?? ""}
                                {pct != null && <> · {pct}%</>}
                              </p>
                            )}
                            {pct != null && (
                              <div className="mt-2 max-w-sm">
                                <Progress value={pct} className={cn(completed && "[&>div]:bg-emerald-500")} />
                              </div>
                            )}
                          </div>
                          {!completed && g.targetValue && (
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => incrementProgress(g)} className="h-7 text-xs">+ прогресс</Button>
                              <Button size="sm" variant="ghost" onClick={() => markDone(g)} className="h-7 text-xs">Готово</Button>
                            </div>
                          )}
                          {completed && (
                            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Progress by level */}
            {!loadingGoals && goals.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/80 mb-4">
                  Прогресс по целям
                </h2>
                <div className="space-y-5">
                  {(["weekly", "monthly", "yearly"] as Level[]).map((lvl) => {
                    const items = byLevel[lvl]
                    if (!items || items.length === 0) return null
                    const meta = LEVEL_META[lvl]
                    const Icon = meta.icon
                    return (
                      <div key={lvl}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={cn("size-4", meta.accent)} />
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {meta.label}
                          </h3>
                        </div>
                        <div className="space-y-2.5">
                          {items.map((g) => {
                            const pct = percent(g)
                            const completed = g.status === "completed"
                            return (
                              <div key={g.id}>
                                <div className="flex items-baseline justify-between text-sm">
                                  <span className="text-foreground/90 truncate pr-2">{g.title}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {g.targetValue
                                      ? <>{fmtNum(g.currentValue)}/{fmtNum(g.targetValue)} {g.targetUnit ?? ""}{pct != null && <> · {pct}%</>}</>
                                      : (completed ? "выполнено" : "без цифры")}
                                  </span>
                                </div>
                                {pct != null ? (
                                  <Progress value={pct} className={cn("mt-1", completed && "[&>div]:bg-emerald-500")} />
                                ) : completed ? (
                                  <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="size-3" /> выполнено
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Nancy commentary */}
            <section className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 p-5">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center">
                  <Sparkles className="size-5" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-foreground">Слово от Нэнси</h2>
                  <div className="mt-2 text-sm leading-relaxed text-foreground/90 min-h-[2.5em]">
                    {loadingAi ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Dot delay="0s" /><Dot delay="0.15s" /><Dot delay="0.3s" />
                        <span className="ml-1 text-xs">Нэнси анализирует ваши цели…</span>
                      </div>
                    ) : (
                      <p>{commentary}</p>
                    )}
                  </div>
                  {!loadingAi && generatedAt && (
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Обновлено: {new Date(generatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                      <button
                        onClick={() => loadCommentary(true)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Обновить
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce inline-block"
      style={{ animationDelay: delay }}
    />
  )
}
