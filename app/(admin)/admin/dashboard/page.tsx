"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Building2, Users, CreditCard, TrendingUp, Loader2, LayoutDashboard, Clock,
} from "lucide-react"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface MonthData {
  month: string
  count: number
  label: string
}

interface RecentReg {
  id: string
  name: string
  subscriptionStatus: string | null
  createdAt: string | null
  planName: string | null
}

interface ExpiringTrial {
  id: string
  name: string
  trialEndsAt: string | null
  daysLeft: number | null
}

interface DashboardData {
  totalCompanies: number
  activeSubscriptions: number
  totalUsers: number
  mrr: number
  registrationsByMonth: MonthData[]
  recentRegistrations: RecentReg[]
  expiringTrials: ExpiringTrial[]
}

// ─── Компоненты ───────────────────────────────────────────────────────────────

function MetricCard({
  title, value, icon: Icon, color,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          </div>
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Простой CSS-бар-чарт (без recharts)
function BarChart({ data }: { data: MonthData[] }) {
  if (data.length === 0) return null
  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="flex items-end gap-2 h-36 w-full">
      {data.map(d => {
        const heightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0
        return (
          <div key={d.month} className="flex flex-col items-center flex-1 gap-1 h-full">
            <div className="flex-1 flex items-end w-full">
              <div
                className="w-full rounded-t bg-primary/70 hover:bg-primary transition-all relative group"
                style={{ height: `${Math.max(heightPct, d.count > 0 ? 4 : 0)}%` }}
              >
                {d.count > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-medium text-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {d.count}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{d.label}</span>
            <span className="text-xs font-medium text-foreground">{d.count}</span>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активен",  color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  trial:     { label: "Пробный",  color: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  expired:   { label: "Истёк",    color: "bg-red-500/10 text-red-700 border-red-200" },
  cancelled: { label: "Отменён",  color: "bg-muted text-muted-foreground border-border" },
}

// ─── Основная страница ────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Заголовок */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <LayoutDashboard className="w-5 h-5 text-primary" />
                <h1 className="text-2xl font-semibold text-foreground">Дашборд администратора</h1>
              </div>
              <p className="text-muted-foreground text-sm">Ключевые метрики платформы</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : data && (
              <>
                {/* Метрики */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Компаний"
                    value={data.totalCompanies.toLocaleString("ru-RU")}
                    icon={Building2}
                    color="bg-blue-500/10 text-blue-600"
                  />
                  <MetricCard
                    title="Активных подписок"
                    value={data.activeSubscriptions.toLocaleString("ru-RU")}
                    icon={CreditCard}
                    color="bg-emerald-500/10 text-emerald-600"
                  />
                  <MetricCard
                    title="Пользователей"
                    value={data.totalUsers.toLocaleString("ru-RU")}
                    icon={Users}
                    color="bg-purple-500/10 text-purple-600"
                  />
                  <MetricCard
                    title="MRR ₽"
                    value={data.mrr.toLocaleString("ru-RU") + " ₽"}
                    icon={TrendingUp}
                    color="bg-amber-500/10 text-amber-600"
                  />
                </div>

                {/* График регистраций */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Регистрации по месяцам</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.registrationsByMonth.every(d => d.count === 0) ? (
                      <div className="flex items-center justify-center h-36 text-sm text-muted-foreground">
                        Нет данных за последние 6 месяцев
                      </div>
                    ) : (
                      <BarChart data={data.registrationsByMonth} />
                    )}
                  </CardContent>
                </Card>

                {/* Две колонки: последние регистрации + истекающие trial */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Последние регистрации */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Последние регистрации
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {data.recentRegistrations.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6 px-4">
                          Нет данных
                        </p>
                      ) : (
                        <div className="divide-y">
                          {data.recentRegistrations.map(reg => {
                            const statusCfg = STATUS_CONFIG[reg.subscriptionStatus ?? ""] ?? {
                              label: reg.subscriptionStatus ?? "—", color: ""
                            }
                            return (
                              <Link
                                key={reg.id}
                                href={`/admin/clients/${reg.id}`}
                                className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                              >
                                <div>
                                  <p className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                    {reg.name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {reg.planName && (
                                      <span className="text-xs text-muted-foreground">{reg.planName}</span>
                                    )}
                                    {reg.createdAt && (
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(reg.createdAt).toLocaleDateString("ru-RU")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Badge variant="outline" className={cn("text-xs shrink-0", statusCfg.color)}>
                                  {statusCfg.label}
                                </Badge>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Trial истекает скоро */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500" />
                        Trial истекает скоро
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {data.expiringTrials.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6 px-4">
                          Нет истекающих trial-аккаунтов
                        </p>
                      ) : (
                        <div className="divide-y">
                          {data.expiringTrials.map(trial => (
                            <Link
                              key={trial.id}
                              href={`/admin/clients/${trial.id}`}
                              className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">{trial.name}</p>
                                {trial.trialEndsAt && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    до {new Date(trial.trialEndsAt).toLocaleDateString("ru-RU")}
                                  </p>
                                )}
                              </div>
                              {trial.daysLeft !== null && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs shrink-0",
                                    trial.daysLeft === 0
                                      ? "bg-red-500/10 text-red-700 border-red-200"
                                      : trial.daysLeft <= 1
                                        ? "bg-orange-500/10 text-orange-700 border-orange-200"
                                        : "bg-amber-500/10 text-amber-700 border-amber-200"
                                  )}
                                >
                                  {trial.daysLeft === 0 ? "Сегодня" : `${trial.daysLeft} дн.`}
                                </Badge>
                              )}
                            </Link>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
