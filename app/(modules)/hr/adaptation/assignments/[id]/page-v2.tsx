"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, CheckCircle2, Circle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  id: string
  dayNumber: number
  title: string
  type: string
  isRequired: boolean | null
}

interface Completion {
  stepId: string
  status: string
}

interface AssignmentDetail {
  id: string
  planId: string
  status: string
  currentDay: number | null
  completionPct: number | null
  totalSteps: number | null
  completedSteps: number | null
  plan: { title: string }
  steps: Step[]
  completions: Completion[]
}

const STEP_TYPES: Record<string, string> = {
  lesson: "Урок", task: "Задание", quiz: "Тест", video: "Видео",
  checklist: "Чеклист", meeting: "Встреча",
}

export default function AssignmentDetailPageV2() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<AssignmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/modules/hr/adaptation-v2/assignments/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleComplete = async (stepId: string) => {
    setCompleting(stepId)
    await fetch(`/api/modules/hr/adaptation-v2/assignments/${id}?action=completeStep`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId }),
    })
    load()
    setCompleting(null)
  }

  if (loading || !data) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-64 w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const completedIds = new Set(
    data.completions.filter((c) => c.status === "completed").map((c) => c.stepId)
  )
  const pct = data.completionPct ?? 0
  const byDay = data.steps.reduce((acc, step) => {
    if (!acc[step.dayNumber]) acc[step.dayNumber] = []
    acc[step.dayNumber].push(step)
    return acc
  }, {} as Record<number, Step[]>)
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/hr/adaptation/assignments">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Назначения
              </Link>
            </Button>
          </div>

          {/* Прогресс */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-xl font-semibold">{data.plan.title}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  День {data.currentDay} · {data.completedSteps}/{data.totalSteps} шагов
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{pct}%</div>
                <Badge variant="secondary" className="mt-1">
                  {data.status === "completed" ? "Завершено" :
                   data.status === "active" ? "Активно" : data.status}
                </Badge>
              </div>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Шаги */}
          <div className="space-y-4">
            {days.map((day) => (
              <div key={day}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">
                    {day}
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">День {day}</span>
                </div>
                <div className="ml-9 space-y-1.5">
                  {byDay[day].map((step) => {
                    const done = completedIds.has(step.id)
                    const isCompleting = completing === step.id
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                          done ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card",
                        )}
                      >
                        <button
                          onClick={() => !done && handleComplete(step.id)}
                          disabled={done || isCompleting}
                          className="shrink-0"
                        >
                          {isCompleting ? (
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          ) : done ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                          )}
                        </button>
                        <span className={cn("flex-1 text-sm", done && "line-through text-muted-foreground")}>
                          {step.title}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {STEP_TYPES[step.type] ?? step.type}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
