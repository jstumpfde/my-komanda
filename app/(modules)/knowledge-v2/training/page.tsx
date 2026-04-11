"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Target, Loader2, Phone, Headphones, UserCheck, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Scenario {
  id: string
  title: string
  description: string | null
  type: string
  difficulty: string
  isPreset: boolean
  createdAt: string
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  cold_call: {
    icon: <Phone className="size-4" />,
    label: "Холодный звонок",
    color: "bg-red-500/15 text-red-700",
  },
  inbound_support: {
    icon: <Headphones className="size-4" />,
    label: "Обслуживание",
    color: "bg-blue-500/15 text-blue-700",
  },
  interview: {
    icon: <UserCheck className="size-4" />,
    label: "Собеседование",
    color: "bg-violet-500/15 text-violet-700",
  },
  custom: {
    icon: <Target className="size-4" />,
    label: "Кастомный",
    color: "bg-muted text-muted-foreground",
  },
}

const DIFFICULTY_META: Record<string, { label: string; className: string }> = {
  easy: { label: "Легко", className: "bg-emerald-500/15 text-emerald-700" },
  medium: { label: "Средне", className: "bg-amber-500/15 text-amber-700" },
  hard: { label: "Сложно", className: "bg-red-500/15 text-red-700" },
}

export default function TrainingListPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/modules/knowledge/training")
        if (res.ok) {
          const data = (await res.json()) as { scenarios: Scenario[] }
          setScenarios(data.scenarios)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/knowledge-v2" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Тренировки</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="size-5 text-violet-500" />
                  <h1 className="text-xl font-semibold">Тренировки с AI</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Ролевые сценарии: AI играет собеседника, оценивает ваш диалог и даёт рекомендации
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Загрузка...
              </div>
            ) : scenarios.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Target className="size-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Пока нет сценариев</p>
                <p className="text-xs text-muted-foreground">
                  Встроенные сценарии появятся автоматически — обновите страницу.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scenarios.map((s) => {
                  const typeMeta = TYPE_META[s.type] ?? TYPE_META.custom
                  const diffMeta = DIFFICULTY_META[s.difficulty] ?? DIFFICULTY_META.medium
                  return (
                    <div
                      key={s.id}
                      className="group flex flex-col border rounded-xl p-5 bg-card transition-all hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn("p-2 rounded-lg", typeMeta.color)}>{typeMeta.icon}</div>
                        <div className="flex gap-1.5">
                          <Badge variant="secondary" className={cn("text-[10px]", typeMeta.color)}>
                            {typeMeta.label}
                          </Badge>
                          <Badge variant="secondary" className={cn("text-[10px]", diffMeta.className)}>
                            {diffMeta.label}
                          </Badge>
                        </div>
                      </div>

                      <h3 className="font-semibold text-sm mb-1 line-clamp-2">{s.title}</h3>
                      {s.description && (
                        <p className="text-xs text-muted-foreground line-clamp-3 mb-4 flex-1">
                          {s.description}
                        </p>
                      )}

                      <Link href={`/knowledge-v2/training/${s.id}`}>
                        <Button className="w-full gap-1.5" size="sm">
                          <Target className="size-3.5" />
                          Начать тренировку
                        </Button>
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
