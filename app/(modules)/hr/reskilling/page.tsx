"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Brain, Cpu, TrendingUp, AlertTriangle, ChevronDown, ChevronRight,
  BookOpen, Target, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ReskillingAssessment {
  id: string
  position: string
  department: string | null
  automationRisk: number
  riskLevel: string
  aiImpactSummary: string | null
  tasksAtRisk: { task: string; riskPct: number; alternative: string }[] | null
  recommendedSkills: { skillName: string; priority: string; courseId?: string }[] | null
}

interface ReskillingPlan {
  id: string
  employeeName: string | null
  currentPosition: string | null
  targetPosition: string | null
  status: string
  progress: number
}

const RISK_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  critical: { bg: "bg-red-500/15",    text: "text-red-700 dark:text-red-400",     bar: "bg-red-500" },
  high:     { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400", bar: "bg-orange-500" },
  medium:   { bg: "bg-amber-500/15",  text: "text-amber-700 dark:text-amber-400",  bar: "bg-amber-500" },
  low:      { bg: "bg-emerald-500/15",text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
}

export default function ReskillingPage() {
  const [assessments, setAssessments] = useState<ReskillingAssessment[]>([])
  const [plans, setPlans] = useState<ReskillingPlan[]>([])
  const [tab, setTab] = useState<"risk" | "plans">("risk")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [aRes, pRes] = await Promise.all([
        fetch("/api/modules/hr/reskilling?type=assessments"),
        fetch("/api/modules/hr/reskilling?type=plans"),
      ])
      setAssessments(await aRes.json())
      setPlans(await pRes.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const seedDemo = async () => {
    await fetch("/api/modules/hr/reskilling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed-demo" }),
    })
    load()
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Reskilling Center" subtitle="AI-оценка рисков автоматизации и переквалификация" />
        <main className="p-6 space-y-6">

          {/* Сводка */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Должностей оценено</p>
              <p className="text-2xl font-semibold">{assessments.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-red-500/10">
              <p className="text-xs text-red-700 dark:text-red-400 mb-1">Высокий риск</p>
              <p className="text-2xl font-semibold text-red-700 dark:text-red-400">
                {assessments.filter(a => a.riskLevel === "critical" || a.riskLevel === "high").length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Планов развития</p>
              <p className="text-2xl font-semibold">{plans.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Средний риск</p>
              <p className="text-2xl font-semibold">
                {assessments.length > 0
                  ? Math.round(assessments.reduce((s, a) => s + a.automationRisk, 0) / assessments.length)
                  : 0}%
              </p>
            </div>
          </div>

          {/* Табы */}
          <div className="flex items-center gap-4 border-b border-border">
            <button onClick={() => setTab("risk")} className={cn("pb-2 text-sm font-medium border-b-2 -mb-px transition-colors", tab === "risk" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Cpu className="size-4 inline mr-1.5" />Риски автоматизации
            </button>
            <button onClick={() => setTab("plans")} className={cn("pb-2 text-sm font-medium border-b-2 -mb-px transition-colors", tab === "plans" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Target className="size-4 inline mr-1.5" />Планы развития ({plans.length})
            </button>
            <div className="flex-1" />
            {assessments.length === 0 && !loading && (
              <Button size="sm" variant="outline" onClick={seedDemo}>Загрузить демо</Button>
            )}
          </div>

          {/* Риски автоматизации */}
          {tab === "risk" && (
            <div className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
              ) : assessments.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="size-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Нет оценок рисков</p>
                  <Button size="sm" onClick={seedDemo}>Загрузить демо</Button>
                </div>
              ) : (
                assessments.map(a => {
                  const colors = RISK_COLORS[a.riskLevel] ?? RISK_COLORS.low
                  const isOpen = expanded === a.id
                  return (
                    <div key={a.id} className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        className="flex items-center gap-4 w-full p-4 hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className={cn("p-2 rounded-lg", colors.bg)}>
                          <Cpu className={cn("size-5", colors.text)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{a.position}</p>
                          <p className="text-xs text-muted-foreground">{a.department}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-24">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={cn("h-full rounded-full", colors.bar)} style={{ width: `${a.automationRisk}%` }} />
                            </div>
                          </div>
                          <span className={cn("text-lg font-semibold w-12 text-right", colors.text)}>{a.automationRisk}%</span>
                          {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                          <p className="text-sm text-muted-foreground">{a.aiImpactSummary}</p>

                          {a.tasksAtRisk && a.tasksAtRisk.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Задачи под угрозой:</p>
                              <div className="space-y-2">
                                {a.tasksAtRisk.map((t, i) => (
                                  <div key={i} className="flex items-center gap-3 text-sm">
                                    <div className="flex-1">
                                      <span>{t.task}</span>
                                      <span className="text-xs text-muted-foreground ml-2">→ {t.alternative}</span>
                                    </div>
                                    <Badge variant="secondary" className={cn("text-xs", t.riskPct >= 70 ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
                                      {t.riskPct}%
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {a.recommendedSkills && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Рекомендованные навыки:</p>
                              <div className="flex flex-wrap gap-2">
                                {a.recommendedSkills.map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    <Zap className="size-3 mr-1" />{s.skillName}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Планы развития */}
          {tab === "plans" && (
            <div className="space-y-3">
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Нет планов переквалификации</p>
              ) : (
                plans.map(p => (
                  <div key={p.id} className="flex items-center gap-4 p-4 border border-border rounded-xl">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Target className="size-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{p.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{p.currentPosition} → {p.targetPosition}</p>
                    </div>
                    <div className="w-24">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-medium w-10 text-right">{p.progress}%</span>
                    <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                  </div>
                ))
              )}
            </div>
          )}

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
