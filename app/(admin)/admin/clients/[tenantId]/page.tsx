"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Building2, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface TenantModule {
  id: string; slug: string; name: string; icon: string | null
  isActive: boolean
  maxVacancies: number | null; maxCandidates: number | null
  maxEmployees: number | null; maxScenarios: number | null; maxUsers: number | null
  usedVacancies: number; usedCandidates: number; usedUsers: number
}

interface Plan { id: string; slug: string; name: string; price: number }
interface Company {
  id: string; name: string; inn: string | null
  subscriptionStatus: string | null; planId: string | null
  trialEndsAt: string | null; createdAt: string | null
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trial:     { label: "Trial",     cls: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400" },
  active:    { label: "Активен",   cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400" },
  paused:    { label: "Пауза",     cls: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400" },
  cancelled: { label: "Отменён",   cls: "bg-muted text-muted-foreground border-border" },
}

function formatPrice(kopecks: number) {
  return (kopecks / 100).toLocaleString("ru-RU") + " ₽"
}

function ProgressBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const overflow = limit ? used > limit : false
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", overflow ? "text-red-600" : "text-foreground")}>
          {used.toLocaleString("ru-RU")} / {limit == null ? "∞" : limit.toLocaleString("ru-RU")}
        </span>
      </div>
      {limit != null && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", overflow ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function toStr(v: number | null | undefined) { return v == null ? "" : String(v) }
function toNum(s: string): number | null { const n = parseInt(s); return isNaN(n) ? null : n }

export default function AdminTenantPage() {
  const params = useParams()
  const tenantId = params.tenantId as string

  const [company, setCompany] = useState<Company | null>(null)
  const [allPlans, setAllPlans] = useState<Plan[]>([])
  const [moduleStates, setModuleStates] = useState<(TenantModule & {
    maxVacanciesStr: string; maxCandidatesStr: string; maxEmployeesStr: string
    maxScenariosStr: string; maxUsersStr: string
  })[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>("none")
  const [subscriptionStatus, setSubscriptionStatus] = useState("trial")

  const [loading, setLoading] = useState(true)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingModules, setSavingModules] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  useEffect(() => {
    fetch(`/api/admin/tenant/${tenantId}`)
      .then(r => r.json())
      .then(data => {
        setCompany(data.company)
        setAllPlans(data.allPlans)
        setSelectedPlanId(data.company.planId ?? "none")
        setSubscriptionStatus(data.company.subscriptionStatus ?? "trial")
        setModuleStates(data.modules.map((m: TenantModule) => ({
          ...m,
          maxVacanciesStr:  toStr(m.maxVacancies),
          maxCandidatesStr: toStr(m.maxCandidates),
          maxEmployeesStr:  toStr(m.maxEmployees),
          maxScenariosStr:  toStr(m.maxScenarios),
          maxUsersStr:      toStr(m.maxUsers),
        })))
      })
      .catch(() => setError("Не удалось загрузить данные"))
      .finally(() => setLoading(false))
  }, [tenantId])

  function showSaved(msg: string) { setSaved(msg); setTimeout(() => setSaved(""), 2500) }

  async function handleSavePlan() {
    if (!selectedPlanId || selectedPlanId === "none") return
    setSavingPlan(true); setError("")
    try {
      const res = await fetch(`/api/admin/tenant/${tenantId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlanId }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Ошибка"); return }
      showSaved("Тариф обновлён")
    } catch { setError("Ошибка сохранения") }
    finally { setSavingPlan(false) }
  }

  async function handleSaveModules() {
    setSavingModules(true); setError("")
    try {
      for (const m of moduleStates) {
        const action = m.isActive ? "activate" : "deactivate"
        await fetch(`/api/admin/tenant/${tenantId}/modules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleId: m.id, action,
            limits: m.isActive ? {
              maxVacancies:  toNum(m.maxVacanciesStr),
              maxCandidates: toNum(m.maxCandidatesStr),
              maxEmployees:  toNum(m.maxEmployeesStr),
              maxScenarios:  toNum(m.maxScenariosStr),
              maxUsers:      toNum(m.maxUsersStr),
            } : undefined,
          }),
        })
      }
      showSaved("Модули обновлены")
    } catch { setError("Ошибка сохранения") }
    finally { setSavingModules(false) }
  }

  function toggleModule(id: string, checked: boolean) {
    setModuleStates(prev => prev.map(m => m.id === id ? { ...m, isActive: checked } : m))
  }

  function setLimit(id: string, field: string, value: string) {
    setModuleStates(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const status = STATUS_LABELS[subscriptionStatus] ?? { label: subscriptionStatus, cls: "" }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-2xl space-y-6">
            {/* Шапка */}
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <Link href="/admin/clients"><ArrowLeft className="w-4 h-4" /></Link>
              </Button>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">{company?.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    {company?.inn && <span className="text-xs text-muted-foreground">ИНН {company.inn}</span>}
                    <Badge variant="outline" className={cn("text-xs", status.cls)}>{status.label}</Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Тариф */}
            <Card>
              <CardHeader><CardTitle className="text-base">Тарифный план</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Текущий тариф</Label>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите тариф" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Без тарифа —</SelectItem>
                      {allPlans.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatPrice(p.price)}/мес
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Статус подписки</Label>
                  <Select value={subscriptionStatus} onValueChange={setSubscriptionStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Активен</SelectItem>
                      <SelectItem value="paused">Пауза</SelectItem>
                      <SelectItem value="cancelled">Отменён</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSavePlan} disabled={savingPlan || selectedPlanId === "none"} className="gap-2">
                  {savingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Применить тариф
                </Button>
              </CardContent>
            </Card>

            {/* Модули и лимиты */}
            <Card>
              <CardHeader><CardTitle className="text-base">Модули и лимиты</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {moduleStates.map(mod => (
                  <div key={mod.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`mod-${mod.id}`}
                        checked={mod.isActive}
                        onCheckedChange={v => toggleModule(mod.id, !!v)}
                      />
                      <Label htmlFor={`mod-${mod.id}`} className="font-medium cursor-pointer">{mod.name}</Label>
                      <Badge variant={mod.isActive ? "default" : "outline"} className="ml-auto text-xs">
                        {mod.isActive ? "Подключён" : "Отключён"}
                      </Badge>
                    </div>

                    {mod.isActive && (
                      <>
                        {/* Лимиты (редактируемые) */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-7">
                          {[
                            { field: "maxVacanciesStr",  label: "Вакансий" },
                            { field: "maxCandidatesStr", label: "Кандидатов" },
                            { field: "maxEmployeesStr",  label: "Сотрудников" },
                            { field: "maxScenariosStr",  label: "Сценариев" },
                            { field: "maxUsersStr",      label: "Пользователей" },
                          ].map(({ field, label }) => (
                            <div key={field} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{label}</Label>
                              <Input
                                type="number"
                                placeholder="∞"
                                className="h-8 text-sm"
                                value={(mod as Record<string, string>)[field]}
                                onChange={e => setLimit(mod.id, field, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Прогресс-бары использования */}
                        <div className="pl-7 space-y-2 pt-1 border-t">
                          <p className="text-xs font-medium text-muted-foreground pt-1">Использование</p>
                          <ProgressBar used={mod.usedVacancies}  limit={mod.maxVacancies}  label="Вакансий" />
                          <ProgressBar used={mod.usedCandidates} limit={mod.maxCandidates} label="Кандидатов" />
                          <ProgressBar used={mod.usedUsers}      limit={mod.maxUsers}      label="Пользователей" />
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={handleSaveModules} disabled={savingModules} variant="outline" className="gap-2">
                    {savingModules ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить модули
                  </Button>
                  {saved && <p className="text-sm text-emerald-600 font-medium">{saved}</p>}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
