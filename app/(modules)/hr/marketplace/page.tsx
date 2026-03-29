"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Store, Plus, Users, Calendar, Zap, CheckCircle, Clock, ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Project {
  id: string
  title: string
  description: string | null
  department: string | null
  requiredSkills: { skillName: string; minLevel: number }[] | null
  status: string
  maxParticipants: number
  startDate: string | null
  endDate: string | null
  applicationCount: number
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open:        { label: "Открыт",     color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: Clock },
  in_progress: { label: "В работе",   color: "bg-blue-500/15 text-blue-700 dark:text-blue-400",          icon: ArrowRight },
  completed:   { label: "Завершён",   color: "bg-muted text-muted-foreground",                           icon: CheckCircle },
  cancelled:   { label: "Отменён",    color: "bg-muted text-muted-foreground",                           icon: Clock },
}

export default function MarketplacePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/hr/marketplace")
      setProjects(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const seedDemo = async () => {
    await fetch("/api/modules/hr/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed-demo" }),
    })
    load()
  }

  const openProjects = projects.filter(p => p.status === "open")
  const activeProjects = projects.filter(p => p.status === "in_progress")

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Маркетплейс навыков" subtitle="Внутренние проекты и заявки сотрудников" />
        <main className="p-6 space-y-6">

          {/* Сводка */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Всего проектов</p>
              <p className="text-2xl font-semibold">{projects.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Открытых</p>
              <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{openProjects.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10">
              <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">В работе</p>
              <p className="text-2xl font-semibold text-blue-700 dark:text-blue-400">{activeProjects.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Заявок</p>
              <p className="text-2xl font-semibold">{projects.reduce((s, p) => s + p.applicationCount, 0)}</p>
            </div>
          </div>

          {/* Тулбар */}
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            {projects.length === 0 && !loading && (
              <Button size="sm" variant="outline" onClick={seedDemo}>Загрузить демо</Button>
            )}
          </div>

          {/* Проекты */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <Store className="size-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Нет проектов</p>
              <Button size="sm" onClick={seedDemo}>Загрузить демо</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(p => {
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.open
                return (
                  <div key={p.id} className="border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm mb-1">{p.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                      </div>
                      <Badge variant="secondary" className={cn("text-xs ml-3 shrink-0", cfg.color)}>{cfg.label}</Badge>
                    </div>

                    {/* Навыки */}
                    {p.requiredSkills && p.requiredSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {p.requiredSkills.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs bg-primary/10 text-primary">
                            <Zap className="size-3 mr-1" />{s.skillName} ≥{s.minLevel}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Мета */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
                      <span className="flex items-center gap-1">
                        <Store className="size-3.5" />{p.department}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" />{p.applicationCount}/{p.maxParticipants} заявок
                      </span>
                      {p.endDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3.5" />до {new Date(p.endDate).toLocaleDateString("ru")}
                        </span>
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
