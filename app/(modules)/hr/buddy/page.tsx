"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Loader2, HeartHandshake, ArrowRight, Calendar, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface Assignment {
  id: string
  employeeId: string | null
  buddyId: string | null
  status: string
  currentDay: number
  completionPct: number
  totalSteps: number | null
  completedSteps: number
  startDate: string | null
  planTitle?: string
  planType?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активна",   color: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400" },
  paused:    { label: "Пауза",     color: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400" },
  cancelled: { label: "Отменена",  color: "bg-muted text-muted-foreground border-border" },
  completed: { label: "Завершена", color: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400" },
}

export default function BuddyDashboardPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/modules/hr/buddy/my-assignments")
      .then(r => r.json())
      .then((data: Assignment[]) => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <HeartHandshake className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Наставник</h1>
                <p className="text-sm text-muted-foreground">Мои подопечные на адаптации</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-14 text-muted-foreground/25 mb-4" />
                <p className="text-muted-foreground font-medium">Подопечных нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Когда вас назначат наставником, здесь появятся сотрудники
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {assignments.map(a => {
                  const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.active
                  const startDate = a.startDate
                    ? new Date(a.startDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })
                    : "—"

                  return (
                    <div key={a.id} className="rounded-xl border bg-card p-4 flex flex-col gap-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                            {a.employeeId ? a.employeeId.slice(0, 2).toUpperCase() : "—"}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">
                              {a.employeeId ? `Сотрудник ${a.employeeId.slice(0, 8)}` : "Не назначен"}
                            </p>
                            <p className="text-xs text-muted-foreground">{a.planTitle ?? "—"}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px]", sc.color)}>{sc.label}</Badge>
                      </div>

                      {/* Progress */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>День {a.currentDay} · {a.completedSteps}/{a.totalSteps ?? "?"} шагов</span>
                          <span className="font-semibold text-primary">{a.completionPct}%</span>
                        </div>
                        <Progress value={a.completionPct} className="h-1.5" />
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" /> Старт: {startDate}
                        </span>
                        <Link href={`/hr/buddy/${a.id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                            Открыть <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
