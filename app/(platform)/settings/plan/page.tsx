"use client"

import { useEffect, useState } from "react"
import { SettingsNavigation } from "@/components/settings/settings-navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Check, Loader2, Zap, Users, Briefcase, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActiveModule {
  id: string; slug: string; name: string; icon: string | null
  maxVacancies: number | null; maxCandidates: number | null
  maxEmployees: number | null; maxScenarios: number | null; maxUsers: number | null
  usedVacancies: number; usedCandidates: number; usedUsers: number
}

interface Plan {
  id: string; slug: string; name: string; price: number
}

interface PlanData {
  currentPlan: Plan | null
  subscriptionStatus: string | null
  modules: ActiveModule[]
  allPublicPlans: Plan[]
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trial:     { label: "Пробный",  cls: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400" },
  active:    { label: "Активен",  cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400" },
  paused:    { label: "Пауза",    cls: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400" },
  cancelled: { label: "Отменён", cls: "bg-muted text-muted-foreground border-border" },
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  recruiting:   <Briefcase className="w-4 h-4" />,
  "hr-ops":     <UserCheck className="w-4 h-4" />,
  "talent-pool": <Users className="w-4 h-4" />,
  marketing:    <Zap className="w-4 h-4" />,
}

function ProgressBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  if (limit === null) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{used.toLocaleString("ru-RU")} / ∞</span>
      </div>
    )
  }
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const overflow = used > limit
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", overflow ? "text-red-600" : "text-foreground")}>
          {used.toLocaleString("ru-RU")} / {limit.toLocaleString("ru-RU")}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all",
            overflow ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

const PLAN_HIGHLIGHTS: Record<string, boolean> = { business: true }

export default function SettingsPlanPage() {
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/tenant/plan")
      .then(r => r.json())
      .then(d => setData(d.data ?? d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSelectPlan(planId: string) {
    if (switching) return
    setSwitching(planId)
    try {
      const res = await fetch("/api/tenant/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) return
      // Refresh data
      const r = await fetch("/api/tenant/plan")
      const d = await r.json()
      setData(d.data ?? d)
      setModalOpen(false)
    } catch { /* ignore */ }
    finally { setSwitching(null) }
  }

  if (loading) {
    return (
      <div>
        <SettingsNavigation />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const status = STATUS_LABELS[data?.subscriptionStatus ?? ""] ?? { label: data?.subscriptionStatus ?? "", cls: "" }

  return (
    <div>
      <SettingsNavigation />

      <div className="space-y-6 max-w-2xl">
        {/* Текущий тариф */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Текущий тариф</CardTitle>
              <Badge variant="outline" className={cn("text-xs", status.cls)}>{status.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {data?.currentPlan ? (
              <>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-bold">{data.currentPlan.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {(data.currentPlan.price / 100).toLocaleString("ru-RU")} ₽ / мес
                    </p>
                  </div>
                  <Button onClick={() => setModalOpen(true)} size="sm" variant="outline" className="gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Сменить тариф
                  </Button>
                </div>

                {/* Модули */}
                {data.modules.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Подключённые модули</p>
                    <div className="space-y-4">
                      {data.modules.map(mod => (
                        <div key={mod.id} className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                              {MODULE_ICONS[mod.slug] ?? <Briefcase className="w-4 h-4" />}
                            </div>
                            <span className="font-medium text-sm">{mod.name}</span>
                          </div>
                          <div className="space-y-2">
                            <ProgressBar used={mod.usedVacancies}  limit={mod.maxVacancies}  label="Вакансии" />
                            <ProgressBar used={mod.usedCandidates} limit={mod.maxCandidates} label="Кандидаты" />
                            <ProgressBar used={mod.usedUsers}      limit={mod.maxUsers}      label="Пользователи" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-6 space-y-3">
                <p className="text-muted-foreground">Тариф не выбран</p>
                <Button onClick={() => setModalOpen(true)} size="sm" className="gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Выбрать тариф
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Модалка смены тарифа */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Выберите тариф</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {data?.allPublicPlans.map(plan => {
              const isCurrent = plan.id === data.currentPlan?.id
              const isHighlight = PLAN_HIGHLIGHTS[plan.slug]
              const isLoading = switching === plan.id
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative rounded-xl border p-4 flex flex-col gap-3 transition-all",
                    isCurrent
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : isHighlight
                      ? "border-primary/40 shadow-sm"
                      : "border-border"
                  )}
                >
                  {isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Badge className="text-xs whitespace-nowrap">Текущий</Badge>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-sm">{plan.name}</p>
                    <p className="text-xl font-bold mt-0.5">
                      {(plan.price / 100).toLocaleString("ru-RU")} ₽
                    </p>
                    <p className="text-xs text-muted-foreground">в месяц</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isCurrent ? "secondary" : "default"}
                    className="w-full gap-1"
                    disabled={isCurrent || !!switching}
                    onClick={() => handleSelectPlan(plan.id)}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isCurrent ? (
                      <><Check className="w-3.5 h-3.5" /> Активен</>
                    ) : (
                      "Выбрать"
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center pt-2">
            Нужна помощь? Напишите на{" "}
            <a href="mailto:support@mykomanda.ru" className="text-primary hover:underline">
              support@mykomanda.ru
            </a>
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
