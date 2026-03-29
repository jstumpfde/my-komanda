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
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Building2, Loader2, Save, Plus } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ModuleUsage {
  vacancies:  number
  candidates: number
  employees:  number
}

interface ModuleLimits {
  max_vacancies?:  number | null
  max_candidates?: number | null
  max_employees?:  number | null
  [key: string]:   number | null | undefined
}

interface ModuleItem {
  moduleId:       string
  moduleSlug:     string
  moduleName:     string
  color:          string
  enabled:        boolean
  tenantModuleId: string | null
  planId:         string | null
  planName:       string | null
  customLimits:   ModuleLimits | null
  limits:         ModuleLimits | null
  usage:          ModuleUsage
}

interface Plan {
  id:   string
  name: string
  slug: string
}

interface Company {
  id:                 string
  name:               string
  inn:                string | null
  subscriptionStatus: string | null
  planId:             string | null
  trialEndsAt:        string | null
  createdAt:          string | null
}

// ─── Константы ────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  blue:    "border-l-4 border-blue-500",
  purple:  "border-l-4 border-purple-500",
  emerald: "border-l-4 border-emerald-500",
  orange:  "border-l-4 border-orange-500",
  gray:    "border-l-4 border-gray-400",
}

const COLOR_BADGE: Record<string, string> = {
  blue:    "bg-blue-500/10 text-blue-700 border-blue-200",
  purple:  "bg-purple-500/10 text-purple-700 border-purple-200",
  emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  orange:  "bg-orange-500/10 text-orange-700 border-orange-200",
  gray:    "bg-gray-100 text-gray-600 border-gray-200",
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trial:     { label: "Trial",    cls: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400" },
  active:    { label: "Активен",  cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400" },
  paused:    { label: "Пауза",    cls: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400" },
  cancelled: { label: "Отменён",  cls: "bg-muted text-muted-foreground border-border" },
}

// ─── Компоненты ───────────────────────────────────────────────────────────────

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const max = limit ?? 0
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
  const overflow = max > 0 && used > max
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", overflow ? "text-red-600" : "text-foreground")}>
          {used.toLocaleString("ru-RU")} / {limit == null ? "∞" : limit.toLocaleString("ru-RU")}
        </span>
      </div>
      {limit != null && (
        <Progress
          value={pct}
          className={cn("h-1.5", overflow ? "[&>div]:bg-red-500" : pct > 80 ? "[&>div]:bg-amber-500" : "")}
        />
      )}
    </div>
  )
}

// ─── Основная страница ────────────────────────────────────────────────────────

export default function AdminClientPage() {
  const params = useParams()
  const clientId = params.id as string

  const [company, setCompany]       = useState<Company | null>(null)
  const [allPlans, setAllPlans]     = useState<Plan[]>([])
  const [modules, setModules]       = useState<ModuleItem[]>([])
  const [localMods, setLocalMods]   = useState<Record<string, {
    enabled:      boolean
    planId:       string
    customLimits: Record<string, string>
  }>>({})

  const [loading, setLoading]       = useState(true)
  const [savingId, setSavingId]     = useState<string | null>(null)
  const [savedId, setSavedId]       = useState<string | null>(null)
  const [error, setError]           = useState("")

  // Загружаем данные компании (используем существующий endpoint)
  useEffect(() => {
    fetch(`/api/admin/tenant/${clientId}`)
      .then(r => r.json())
      .then(data => {
        setCompany(data.company)
        setAllPlans(data.allPlans ?? [])
      })
      .catch(() => {})
  }, [clientId])

  // Загружаем модули через новый endpoint
  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}/modules`)
      .then(r => r.json())
      .then((data: ModuleItem[]) => {
        setModules(data)
        const init: typeof localMods = {}
        for (const m of data) {
          init[m.moduleId] = {
            enabled:      m.enabled,
            planId:       m.planId ?? "none",
            customLimits: {
              max_vacancies:  String(m.customLimits?.max_vacancies  ?? m.limits?.max_vacancies  ?? ""),
              max_candidates: String(m.customLimits?.max_candidates ?? m.limits?.max_candidates ?? ""),
              max_employees:  String(m.customLimits?.max_employees  ?? m.limits?.max_employees  ?? ""),
            },
          }
        }
        setLocalMods(init)
      })
      .catch(() => setError("Не удалось загрузить модули"))
      .finally(() => setLoading(false))
  }, [clientId])

  function showSaved(id: string) {
    setSavedId(id)
    setTimeout(() => setSavedId(null), 2500)
  }

  function setModEnabled(moduleId: string, value: boolean) {
    setLocalMods(prev => ({ ...prev, [moduleId]: { ...prev[moduleId], enabled: value } }))
  }

  function setModPlan(moduleId: string, planId: string) {
    setLocalMods(prev => ({ ...prev, [moduleId]: { ...prev[moduleId], planId } }))
  }

  function setModLimit(moduleId: string, field: string, value: string) {
    setLocalMods(prev => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        customLimits: { ...prev[moduleId].customLimits, [field]: value },
      },
    }))
  }

  async function handleSave(mod: ModuleItem) {
    setSavingId(mod.moduleId)
    setError("")
    try {
      const local = localMods[mod.moduleId]
      const customLimits: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(local.customLimits)) {
        const n = parseInt(v)
        customLimits[k] = isNaN(n) ? null : n
      }

      const body: Record<string, unknown> = {
        enabled:      local.enabled,
        customLimits: Object.values(customLimits).every(v => v === null) ? null : customLimits,
      }

      if (mod.tenantModuleId) {
        body.tenantModuleId = mod.tenantModuleId
      } else {
        body.moduleId = mod.moduleId
      }

      const res = await fetch(`/api/admin/clients/${clientId}/modules`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Ошибка сохранения")
        return
      }

      // Обновляем локальный стейт модулей после сохранения
      setModules(prev => prev.map(m =>
        m.moduleId === mod.moduleId
          ? { ...m, enabled: local.enabled, customLimits: body.customLimits as ModuleLimits ?? null }
          : m
      ))
      showSaved(mod.moduleId)
    } catch {
      setError("Ошибка сохранения")
    } finally {
      setSavingId(null)
    }
  }

  async function handleConnect(mod: ModuleItem) {
    setSavingId(mod.moduleId)
    setError("")
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/modules`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ moduleId: mod.moduleId, enabled: true }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Ошибка подключения")
        return
      }
      // Перезагружаем модули
      const data: ModuleItem[] = await fetch(`/api/admin/clients/${clientId}/modules`).then(r => r.json())
      setModules(data)
      for (const m of data) {
        if (m.moduleId === mod.moduleId) {
          setLocalMods(prev => ({
            ...prev,
            [m.moduleId]: {
              enabled:      m.enabled,
              planId:       m.planId ?? "none",
              customLimits: {
                max_vacancies:  String(m.customLimits?.max_vacancies  ?? m.limits?.max_vacancies  ?? ""),
                max_candidates: String(m.customLimits?.max_candidates ?? m.limits?.max_candidates ?? ""),
                max_employees:  String(m.customLimits?.max_employees  ?? m.limits?.max_employees  ?? ""),
              },
            },
          }))
        }
      }
      showSaved(mod.moduleId)
    } catch {
      setError("Ошибка подключения")
    } finally {
      setSavingId(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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

  const status = STATUS_LABELS[company?.subscriptionStatus ?? ""] ?? { label: company?.subscriptionStatus ?? "—", cls: "" }

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
                  <h1 className="text-xl font-semibold text-foreground">{company?.name ?? "Клиент"}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    {company?.inn && (
                      <span className="text-xs text-muted-foreground">ИНН {company.inn}</span>
                    )}
                    <Badge variant="outline" className={cn("text-xs", status.cls)}>
                      {status.label}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Глобальная ошибка */}
            {error && (
              <p className="text-sm text-destructive font-medium">{error}</p>
            )}

            {/* Модули — аккордеон */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Модули и лимиты</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Accordion type="multiple" className="w-full">
                  {modules.map(mod => {
                    const local     = localMods[mod.moduleId]
                    const colCls    = COLOR_MAP[mod.color] ?? COLOR_MAP.gray
                    const badgeCls  = COLOR_BADGE[mod.color] ?? COLOR_BADGE.gray
                    const isSaving  = savingId === mod.moduleId
                    const isSaved   = savedId  === mod.moduleId
                    const isEnabled = local?.enabled ?? mod.enabled

                    return (
                      <AccordionItem
                        key={mod.moduleId}
                        value={mod.moduleId}
                        className={cn(
                          "border-b last:border-b-0 rounded-none",
                          !isEnabled && "opacity-60"
                        )}
                      >
                        <AccordionTrigger className={cn("px-4 py-3 hover:no-underline", colCls)}>
                          <div className="flex items-center gap-3 flex-1 text-left">
                            <span className="font-medium text-sm">{mod.moduleName}</span>
                            <Badge
                              variant="outline"
                              className={cn("text-xs ml-auto mr-2", isEnabled ? badgeCls : "bg-muted text-muted-foreground")}
                            >
                              {isEnabled ? "Подключён" : "Отключён"}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-4 pb-4 pt-2 space-y-4">
                          {!mod.enabled && !local?.enabled ? (
                            /* Модуль не подключён — кнопка подключить */
                            <div className="flex items-center gap-3">
                              <p className="text-sm text-muted-foreground flex-1">
                                Модуль не подключён для этого клиента
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 shrink-0"
                                disabled={isSaving}
                                onClick={() => handleConnect(mod)}
                              >
                                {isSaving
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Plus className="w-3.5 h-3.5" />
                                }
                                Подключить
                              </Button>
                            </div>
                          ) : (
                            <>
                              {/* Тогл активности */}
                              <div className="flex items-center gap-3">
                                <Switch
                                  id={`enabled-${mod.moduleId}`}
                                  checked={local?.enabled ?? mod.enabled}
                                  onCheckedChange={v => setModEnabled(mod.moduleId, v)}
                                />
                                <Label htmlFor={`enabled-${mod.moduleId}`} className="cursor-pointer">
                                  Модуль активен
                                </Label>
                              </div>

                              {/* Выбор тарифного плана */}
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Тарифный план</Label>
                                <Select
                                  value={local?.planId ?? "none"}
                                  onValueChange={v => setModPlan(mod.moduleId, v)}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Выберите тариф" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">— Без тарифа —</SelectItem>
                                    {allPlans.map(p => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Прогресс-бары использования */}
                              {(local?.enabled ?? mod.enabled) && (
                                <div className="space-y-2 pt-1 border-t">
                                  <p className="text-xs font-medium text-muted-foreground pt-1">Использование</p>
                                  <UsageBar
                                    label="Вакансии"
                                    used={mod.usage.vacancies}
                                    limit={mod.limits?.max_vacancies}
                                  />
                                  <UsageBar
                                    label="Кандидаты"
                                    used={mod.usage.candidates}
                                    limit={mod.limits?.max_candidates}
                                  />
                                  <UsageBar
                                    label="Сотрудники"
                                    used={mod.usage.employees}
                                    limit={mod.limits?.max_employees}
                                  />
                                </div>
                              )}

                              {/* Кастомные лимиты */}
                              <div className="space-y-2 pt-1 border-t">
                                <p className="text-xs font-medium text-muted-foreground pt-1">
                                  Кастомные лимиты (переопределяют тариф)
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                  {[
                                    { field: "max_vacancies",  label: "Вакансий" },
                                    { field: "max_candidates", label: "Кандидатов" },
                                    { field: "max_employees",  label: "Сотрудников" },
                                  ].map(({ field, label }) => (
                                    <div key={field} className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">{label}</Label>
                                      <Input
                                        type="number"
                                        placeholder="∞"
                                        className="h-8 text-sm"
                                        value={local?.customLimits?.[field] ?? ""}
                                        onChange={e => setModLimit(mod.moduleId, field, e.target.value)}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Кнопка сохранить */}
                              <div className="flex items-center gap-3 pt-1">
                                <Button
                                  size="sm"
                                  onClick={() => handleSave(mod)}
                                  disabled={isSaving}
                                  className="gap-2"
                                >
                                  {isSaving
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Save className="w-3.5 h-3.5" />
                                  }
                                  Сохранить
                                </Button>
                                {isSaved && (
                                  <span className="text-xs text-emerald-600 font-medium">Сохранено</span>
                                )}
                              </div>
                            </>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              </CardContent>
            </Card>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
