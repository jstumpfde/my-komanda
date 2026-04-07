"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Rocket, Plus, ArrowRight, Calendar, ClipboardList, Mail, FileText, Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface AdaptationPlan {
  id: string
  title: string
  description: string | null
  planType: string
  durationDays: number
  isTemplate: boolean
  isActive: boolean
}

// Шаблонные шаги пребординга
const PREBOARDING_TEMPLATE_STEPS = [
  { day: -7, title: "Приветственное письмо от CEO", type: "lesson", channel: "email" },
  { day: -7, title: "Ссылка на Welcome-книгу", type: "lesson", channel: "email" },
  { day: -5, title: "Чеклист документов для оформления", type: "checklist", channel: "email" },
  { day: -5, title: "Видео о компании и культуре", type: "video", channel: "email" },
  { day: -3, title: "Знакомство с наставником (buddy)", type: "meeting", channel: "telegram" },
  { day: -3, title: "Доступы к рабочим инструментам", type: "task", channel: "email" },
  { day: -1, title: "Напоминание о первом дне", type: "lesson", channel: "telegram" },
  { day: -1, title: "Маршрут до офиса / ссылка на Zoom", type: "lesson", channel: "telegram" },
]

const DAY_DESCRIPTIONS: Record<number, string> = {
  [-7]: "Первый контакт — приветствие и базовая информация",
  [-5]: "Документы и знакомство с компанией",
  [-3]: "Знакомство с командой и инструментами",
  [-1]: "Последние приготовления перед первым днём",
}

export default function PreboardingPage() {
  const [plans, setPlans] = useState<AdaptationPlan[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/hr/adaptation/plans")
      const all: AdaptationPlan[] = await res.json()
      // Фильтр: только preboarding и reboarding
      setPlans(all.filter(p => p.planType === "preboarding" || p.planType === "reboarding"))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createTemplate = async (type: "preboarding" | "reboarding") => {
    const title = type === "preboarding"
      ? "Пребординг — стандартный шаблон"
      : "Ребординг — возврат после отсутствия"
    const duration = type === "preboarding" ? 7 : 14

    try {
      const res = await fetch("/api/modules/hr/adaptation/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: type === "preboarding"
            ? "Дни -7, -5, -3, -1 до первого рабочего дня"
            : "План ребординга после декрета, длительного больничного или перевода",
          planType: type,
          durationDays: duration,
          isTemplate: true,
        }),
      })

      if (res.ok) {
        toast.success("Шаблон создан")

        // Если preboarding — создаём шаги с негативными днями
        if (type === "preboarding") {
          const plan = await res.json()
          for (const step of PREBOARDING_TEMPLATE_STEPS) {
            await fetch(`/api/modules/hr/adaptation/plans/${plan.id}/steps`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                dayNumber: step.day,
                title: step.title,
                type: step.type,
                channel: step.channel,
                isRequired: true,
                sortOrder: PREBOARDING_TEMPLATE_STEPS.indexOf(step),
              }),
            })
          }
        }

        load()
      }
    } catch {
      toast.error("Ошибка создания")
    }
  }

  // Сгруппировать шаблонные шаги по дням
  const groupedSteps = PREBOARDING_TEMPLATE_STEPS.reduce((acc, step) => {
    const key = step.day
    if (!acc[key]) acc[key] = []
    acc[key].push(step)
    return acc
  }, {} as Record<number, typeof PREBOARDING_TEMPLATE_STEPS>)

  const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    preboarding: { label: "Пребординг", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    reboarding:  { label: "Ребординг",  color: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Пребординг и ребординг" subtitle="Подготовка до первого дня и возврат после отсутствия" />
        <main className="p-6 space-y-6">

          {/* Шаблон пребординга: таймлайн */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Типовой план пребординга</h2>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              {Object.entries(groupedSteps)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([dayStr, steps]) => {
                  const day = Number(dayStr)
                  return (
                    <div key={day} className="relative">
                      <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-blue-500/15 border-2 border-blue-500 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">{day}</span>
                      </div>
                      <div className="ml-2">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-0.5">День {day}</p>
                        <p className="text-xs text-muted-foreground mb-2">{DAY_DESCRIPTIONS[day]}</p>
                        <div className="space-y-1">
                          {steps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-muted/50">
                              <span className="text-xs">{step.type === "lesson" ? "📖" : step.type === "video" ? "🎬" : step.type === "checklist" ? "☑️" : step.type === "meeting" ? "👥" : "✅"}</span>
                              <span className="flex-1">{step.title}</span>
                              <Badge variant="secondary" className="text-[10px]">{step.channel}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Кнопки создания */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => createTemplate("preboarding")}>
              <Rocket className="size-4 mr-1.5" />Создать план пребординга
            </Button>
            <Button variant="outline" onClick={() => createTemplate("reboarding")}>
              <Users className="size-4 mr-1.5" />Создать план ребординга
            </Button>
          </div>

          {/* Существующие планы */}
          {plans.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">Созданные планы</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map(plan => {
                  const cfg = TYPE_LABELS[plan.planType] ?? TYPE_LABELS.preboarding
                  return (
                    <Card key={plan.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <ClipboardList className="size-4 text-primary" />
                          </div>
                          <Badge variant="secondary" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{plan.title}</p>
                          {plan.description && <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                          <span className="flex items-center gap-1"><Calendar className="size-3.5" />{plan.durationDays} дн.</span>
                        </div>
                        <Link href={`/hr/adaptation/plans/${plan.id}`}>
                          <Button size="sm" variant="outline" className="w-full gap-1.5">
                            Конструктор <ArrowRight className="size-3.5" />
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
