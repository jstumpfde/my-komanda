"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebarV2 } from "@/components/dashboard/sidebar-v2"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Plus, Trash2, GripVertical, Loader2 } from "lucide-react"

interface Step {
  id: string
  dayNumber: number
  title: string
  type: string
  sortOrder: number | null
}

interface Plan {
  id: string
  title: string
  durationDays: number | null
  planType: string | null
  steps: Step[]
}

const STEP_TYPES: Record<string, string> = {
  lesson: "Урок", task: "Задание", quiz: "Тест", video: "Видео",
  checklist: "Чеклист", meeting: "Встреча",
}

export default function PlanDetailPageV2() {
  const { planId } = useParams<{ planId: string }>()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newStep, setNewStep] = useState({ day: "1", title: "", type: "task" })
  const [addingStep, setAddingStep] = useState(false)

  const load = () => {
    fetch(`/api/modules/hr/adaptation-v2/plans/${planId}`)
      .then((r) => r.json())
      .then((d) => { setPlan(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [planId])

  const handleAddStep = async () => {
    if (!newStep.title.trim()) return
    setAddingStep(true)
    const res = await fetch(`/api/modules/hr/adaptation-v2/plans/${planId}?action=addStep`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayNumber: parseInt(newStep.day) || 1,
        title: newStep.title,
        type: newStep.type,
      }),
    })
    if (res.ok) {
      setNewStep({ day: "1", title: "", type: "task" })
      load()
    }
    setAddingStep(false)
  }

  const handleDeleteStep = async (stepId: string) => {
    await fetch(`/api/modules/hr/adaptation-v2/plans/${planId}?action=deleteStep&stepId=${stepId}`, {
      method: "DELETE",
    })
    load()
  }

  const handleDeletePlan = async () => {
    setSaving(true)
    await fetch(`/api/modules/hr/adaptation-v2/plans/${planId}`, { method: "DELETE" })
    router.push("/hr/adaptation/plans")
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebarV2 />
        <SidebarInset>
          <DashboardHeader />
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!plan) return null

  const stepsByDay = plan.steps.reduce((acc, step) => {
    const day = step.dayNumber
    if (!acc[day]) acc[day] = []
    acc[day].push(step)
    return acc
  }, {} as Record<number, Step[]>)

  const days = Object.keys(stepsByDay).map(Number).sort((a, b) => a - b)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebarV2 />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/hr/adaptation/plans">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Планы
              </Link>
            </Button>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{plan.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span>{plan.steps.length} шагов</span>
                <span>{plan.durationDays} дней</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/hr/adaptation/assignments`}>
                  <Plus className="w-4 h-4 mr-1" />
                  Назначить
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeletePlan}
                disabled={saving}
                className="text-destructive hover:text-destructive"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Шаги по дням */}
          {plan.steps.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
              Шагов пока нет. Добавьте первый шаг ниже.
            </div>
          ) : (
            <div className="space-y-4">
              {days.map((day) => (
                <div key={day}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                      {day}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">День {day}</span>
                  </div>
                  <div className="ml-10 space-y-1.5">
                    {stepsByDay[day].map((step) => (
                      <div
                        key={step.id}
                        className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30" />
                        <span className="flex-1 text-sm">{step.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {STEP_TYPES[step.type] ?? step.type}
                        </Badge>
                        <button
                          onClick={() => handleDeleteStep(step.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Добавить шаг */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">Добавить шаг</p>
            <div className="grid grid-cols-[60px_1fr_120px] gap-2">
              <Input
                placeholder="День"
                type="number"
                min={1}
                value={newStep.day}
                onChange={(e) => setNewStep((s) => ({ ...s, day: e.target.value }))}
              />
              <Input
                placeholder="Название шага..."
                value={newStep.title}
                onChange={(e) => setNewStep((s) => ({ ...s, title: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAddStep()}
              />
              <Select value={newStep.type} onValueChange={(v) => setNewStep((s) => ({ ...s, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPES).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddStep} disabled={!newStep.title.trim() || addingStep} size="sm">
              {addingStep ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Добавить
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
