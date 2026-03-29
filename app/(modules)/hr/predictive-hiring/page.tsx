"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Radar, AlertTriangle, Briefcase, UserPlus, X, RefreshCw, Scan,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PredictiveAlert {
  id: string
  employeeId: string
  employeeName: string | null
  position: string | null
  department: string | null
  riskScore: number | null
  status: string
  vacancyId: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:                { label: "Новый",             color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  vacancy_created:    { label: "Вакансия создана",  color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  talent_pool_matched:{ label: "Найдены кандидаты", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  resolved:           { label: "Решён",             color: "bg-muted text-muted-foreground" },
  dismissed:          { label: "Отклонён",          color: "bg-muted text-muted-foreground" },
}

export default function PredictiveHiringPage() {
  const [alerts, setAlerts] = useState<PredictiveAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/hr/predictive-hiring")
      setAlerts(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const scan = async () => {
    setScanning(true)
    try {
      const res = await fetch("/api/modules/hr/predictive-hiring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      })
      const data = await res.json()
      load()
    } catch { /* ignore */ }
    setScanning(false)
  }

  const createVacancy = async (alertId: string) => {
    await fetch("/api/modules/hr/predictive-hiring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-vacancy", alertId }),
    })
    load()
  }

  const dismiss = async (alertId: string) => {
    await fetch("/api/modules/hr/predictive-hiring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", alertId }),
    })
    load()
  }

  const activeAlerts = alerts.filter(a => a.status === "new" || a.status === "vacancy_created")
  const resolvedAlerts = alerts.filter(a => a.status === "resolved" || a.status === "dismissed")

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Predictive Hiring" subtitle="Упреждающий найм на основе Flight Risk" />
        <main className="p-6 space-y-6">

          {/* Сводка */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-red-500/10">
              <p className="text-xs text-red-700 dark:text-red-400 mb-1">Активных алертов</p>
              <p className="text-2xl font-semibold text-red-700 dark:text-red-400">{activeAlerts.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10">
              <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">Вакансий создано</p>
              <p className="text-2xl font-semibold text-blue-700 dark:text-blue-400">
                {alerts.filter(a => a.status === "vacancy_created").length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Всего алертов</p>
              <p className="text-2xl font-semibold">{alerts.length}</p>
            </div>
          </div>

          {/* Кнопка сканирования */}
          <div className="flex items-center gap-3">
            <Button onClick={scan} disabled={scanning}>
              {scanning ? <RefreshCw className="size-4 mr-1.5 animate-spin" /> : <Scan className="size-4 mr-1.5" />}
              Сканировать Flight Risk
            </Button>
            <p className="text-xs text-muted-foreground">
              Находит сотрудников с критическим уровнем риска и предлагает создать вакансию-замену
            </p>
          </div>

          {/* Алерты */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12">
              <Radar className="size-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Нет алертов</p>
              <p className="text-xs text-muted-foreground">Нажмите «Сканировать Flight Risk» чтобы найти сотрудников с критическим риском увольнения</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => {
                const cfg = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.new
                return (
                  <div key={alert.id} className="flex items-center gap-4 p-4 border border-border rounded-xl hover:border-primary/30 transition-colors">
                    <div className="p-2 rounded-lg bg-red-500/15">
                      <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{alert.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.position} · {alert.department} · Risk: {alert.riskScore}
                      </p>
                    </div>
                    <Badge variant="secondary" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                    {alert.status === "new" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => createVacancy(alert.id)}>
                          <Briefcase className="size-3.5 mr-1" />Создать вакансию
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismiss(alert.id)}>
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    )}
                    {alert.status === "vacancy_created" && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/hr/vacancies/${alert.vacancyId}`}>
                          <Briefcase className="size-3.5 mr-1" />Открыть вакансию
                        </a>
                      </Button>
                    )}
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
