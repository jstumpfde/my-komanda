"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Loader2, ChevronLeft, Check, Clock, Eye, SkipForward, BookOpen, CheckSquare, Video, ClipboardList, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Step {
  id: string
  dayNumber: number
  sortOrder: number
  title: string
  type: string
  channel: string
  durationMin: number | null
  isRequired: boolean
  content: unknown
}

interface Completion {
  id: string
  stepId: string
  status: string
  sentAt: string | null
  viewedAt: string | null
  completedAt: string | null
  score: number | null
}

interface Assignment {
  id: string
  planId: string
  employeeId: string | null
  status: string
  currentDay: number
  completionPct: number
  totalSteps: number | null
  completedSteps: number
  startDate: string | null
  steps: Step[]
  completions: Completion[]
}

const STEP_STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pending:   { label: "Ожидает",    icon: Clock,        color: "text-muted-foreground",  bg: "bg-muted/40" },
  sent:      { label: "Отправлен",  icon: Clock,        color: "text-blue-600",           bg: "bg-blue-50 dark:bg-blue-950/30" },
  viewed:    { label: "Просмотрен", icon: Eye,          color: "text-amber-600",          bg: "bg-amber-50 dark:bg-amber-950/30" },
  completed: { label: "Выполнен",   icon: Check,        color: "text-emerald-600",        bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  skipped:   { label: "Пропущен",   icon: SkipForward,  color: "text-muted-foreground",  bg: "bg-muted/20" },
}

const STEP_TYPE_ICONS: Record<string, React.ElementType> = {
  lesson:    BookOpen,
  task:      CheckSquare,
  quiz:      ClipboardList,
  video:     Video,
  checklist: CheckSquare,
  meeting:   Users,
}

const STEP_TYPE_COLORS: Record<string, string> = {
  lesson: "text-blue-600", task: "text-emerald-600", quiz: "text-violet-600",
  video: "text-rose-600", checklist: "text-amber-600", meeting: "text-cyan-600",
}

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)

  const fetchAssignment = useCallback(async () => {
    const res = await fetch(`/api/modules/hr/adaptation/assignments/${id}`)
    if (!res.ok) { toast.error("Назначение не найдено"); return }
    const data = await res.json() as Assignment
    setAssignment(data)
  }, [id])

  useEffect(() => {
    fetchAssignment().finally(() => setLoading(false))
  }, [fetchAssignment])

  async function handleComplete(stepId: string, status: "completed" | "skipped") {
    setCompleting(stepId)
    try {
      const res = await fetch(`/api/modules/hr/adaptation/assignments/${id}/complete-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, status }),
      })
      if (!res.ok) { toast.error("Ошибка обновления"); return }
      await fetchAssignment()
      toast.success(status === "completed" ? "Шаг выполнен" : "Шаг пропущен")
    } finally {
      setCompleting(null)
    }
  }

  if (loading) return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar /><SidebarInset><DashboardHeader />
      <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </SidebarInset>
    </SidebarProvider>
  )

  if (!assignment) return null

  const completionMap = new Map(assignment.completions.map(c => [c.stepId, c]))
  const days = Array.from(new Set(assignment.steps.map(s => s.dayNumber))).sort((a, b) => a - b)
  const startDate = assignment.startDate
    ? new Date(assignment.startDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })
    : "—"

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/hr/adaptation/assignments")}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">
                  {assignment.employeeId ? `Сотрудник ${assignment.employeeId.slice(0, 8)}` : "Назначение"}
                </h1>
                <p className="text-sm text-muted-foreground">Старт: {startDate}</p>
              </div>
            </div>

            {/* Progress card */}
            <div className="rounded-xl border bg-card p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Прогресс адаптации</span>
                <span className="text-sm font-bold text-primary">{assignment.completionPct}%</span>
              </div>
              <Progress value={assignment.completionPct} className="h-2" />
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>{assignment.completedSteps} из {assignment.totalSteps ?? "?"} шагов</span>
                <span>День {assignment.currentDay}</span>
                <Badge variant="outline" className="text-[10px]">
                  {assignment.status === "active" ? "Активна" : assignment.status === "completed" ? "Завершена" : assignment.status === "paused" ? "Пауза" : "Отменена"}
                </Badge>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-4">
              {days.map(day => {
                const daySteps = assignment.steps
                  .filter(s => s.dayNumber === day)
                  .sort((a, b) => a.sortOrder - b.sortOrder)

                const dayLabel = day < 0 ? `День ${day}` : day === 0 ? "День 0 (выход)" : `День ${day}`
                const isCurrent = day === assignment.currentDay
                const isPast = day < assignment.currentDay

                return (
                  <div key={day} className="flex gap-3">
                    {/* Day marker */}
                    <div className="flex flex-col items-center w-14 shrink-0">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2",
                        isCurrent
                          ? "border-primary bg-primary text-primary-foreground"
                          : isPast
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "border-border bg-muted text-muted-foreground"
                      )}>
                        {day}
                      </div>
                      {day !== days[days.length - 1] && (
                        <div className={cn(
                          "w-0.5 flex-1 mt-1 min-h-[12px]",
                          isPast ? "bg-emerald-300 dark:bg-emerald-800" : "bg-border"
                        )} />
                      )}
                    </div>

                    {/* Day steps */}
                    <div className="flex-1 pb-4">
                      <p className={cn("text-xs font-semibold mb-2", isCurrent ? "text-primary" : "text-muted-foreground")}>
                        {dayLabel} {isCurrent && "← Текущий"}
                      </p>
                      <div className="space-y-2">
                        {daySteps.map(step => {
                          const completion = completionMap.get(step.id)
                          const status = completion?.status ?? "pending"
                          const sc = STEP_STATUS_CONFIG[status] ?? STEP_STATUS_CONFIG.pending
                          const StatusIcon = sc.icon
                          const TypeIcon = STEP_TYPE_ICONS[step.type] ?? BookOpen
                          const typeColor = STEP_TYPE_COLORS[step.type] ?? "text-blue-600"
                          const isDone = status === "completed" || status === "skipped"

                          return (
                            <div key={step.id} className={cn("rounded-lg border p-3 transition-colors", sc.bg)}>
                              <div className="flex items-start gap-2.5">
                                <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-background/60", typeColor)}>
                                  <TypeIcon className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={cn("text-sm font-medium", isDone && "text-muted-foreground line-through")}>{step.title}</p>
                                    {!step.isRequired && (
                                      <span className="text-[10px] text-muted-foreground/60">необяз.</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <span className={cn("text-[10px] flex items-center gap-1 font-medium", sc.color)}>
                                      <StatusIcon className="w-3 h-3" />{sc.label}
                                    </span>
                                    {step.durationMin && (
                                      <span className="text-[10px] text-muted-foreground">{step.durationMin} мин</span>
                                    )}
                                    {completion?.completedAt && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {new Date(completion.completedAt).toLocaleDateString("ru-RU")}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                {!isDone && (
                                  <div className="flex gap-1 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                                      disabled={completing === step.id}
                                      onClick={() => handleComplete(step.id, "completed")}
                                    >
                                      {completing === step.id
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Check className="w-3 h-3" />
                                      }
                                      Выполнен
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs gap-1 text-muted-foreground"
                                      disabled={completing === step.id}
                                      onClick={() => handleComplete(step.id, "skipped")}
                                    >
                                      <SkipForward className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
