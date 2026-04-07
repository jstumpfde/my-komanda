"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  ArrowLeft, Building2, Loader2, Save, Plus, CalendarDays, RotateCcw,
  CheckCircle, Lock, Unlock, Trash2, Users, Receipt, Activity, LayoutGrid,
  UserX, UserCheck, Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ModuleUsage { vacancies: number; candidates: number; employees: number }
interface ModuleLimits { max_vacancies?: number | null; max_candidates?: number | null; max_employees?: number | null; [k: string]: number | null | undefined }
interface ModuleItem {
  moduleId: string; moduleSlug: string; moduleName: string; color: string
  enabled: boolean; tenantModuleId: string | null; planId: string | null
  planName: string | null; customLimits: ModuleLimits | null; limits: ModuleLimits | null
  usage: ModuleUsage
}
interface Plan { id: string; name: string; slug: string }
interface Company {
  id: string; name: string; inn: string | null; kpp: string | null
  legalAddress: string | null; city: string | null; industry: string | null
  billingEmail: string | null; subscriptionStatus: string | null
  planId: string | null; currentPlanId: string | null; trialEndsAt: string | null
  createdAt: string | null; userCount: number
  plan: { id: string; name: string; price: number; slug: string; priceFormatted: number } | null
}
interface UserRow {
  id: string; name: string; email: string; role: string
  isActive: boolean | null; createdAt: string | null; avatarUrl: string | null
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
  trial:     { label: "Trial",    cls: "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400" },
  active:    { label: "Активен",  cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400" },
  paused:    { label: "Пауза",    cls: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400" },
  cancelled: { label: "Отменён",  cls: "bg-muted text-muted-foreground border-border" },
  expired:   { label: "Истёк",    cls: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400" },
}

const ROLE_LABELS: Record<string, string> = {
  director:         "Директор",
  hr_lead:          "Главный HR",
  hr_manager:       "HR-менеджер",
  department_head:  "Рук. отдела",
  observer:         "Наблюдатель",
  platform_admin:   "Адм. платформы",
  platform_manager: "Менеджер платформы",
  admin:            "Администратор",
  manager:          "Менеджер",
}

const CLIENT_ROLES = ["director", "hr_lead", "hr_manager", "department_head", "observer"]

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

  const [company, setCompany]     = useState<Company | null>(null)
  const [allPlans, setAllPlans]   = useState<Plan[]>([])
  const [modules, setModules]     = useState<ModuleItem[]>([])
  const [users, setUsers]         = useState<UserRow[]>([])
  const [localMods, setLocalMods] = useState<Record<string, {
    enabled: boolean; planId: string; customLimits: Record<string, string>
  }>>({})

  const [loading, setLoading]     = useState(true)
  const [usersLoading, setUsersLoading] = useState(false)
  const [savingId, setSavingId]   = useState<string | null>(null)
  const [savedId, setSavedId]     = useState<string | null>(null)
  const [error, setError]         = useState("")
  const [subSaving, setSubSaving] = useState(false)
  const [trialEndsAt, setTrialEndsAt] = useState<string>("")
  const [activeTab, setActiveTab] = useState("overview")

  // Загружаем компанию
  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}`)
      .then(r => r.json())
      .then(data => {
        setCompany(data)
        if (data?.trialEndsAt) {
          setTrialEndsAt(new Date(data.trialEndsAt).toISOString().split("T")[0])
        }
      })
      .catch(() => {})
  }, [clientId])

  // Загружаем планы и модули через существующий endpoint
  useEffect(() => {
    fetch(`/api/admin/tenant/${clientId}`)
      .then(r => r.json())
      .then(data => {
        setAllPlans(data.allPlans ?? [])
      })
      .catch(() => {})
  }, [clientId])

  // Загружаем модули
  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}/modules`)
      .then(r => r.json())
      .then((data: ModuleItem[]) => {
        setModules(data)
        const init: typeof localMods = {}
        for (const m of data) {
          init[m.moduleId] = {
            enabled: m.enabled,
            planId: m.planId ?? "none",
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

  // Загружаем пользователей при переключении на вкладку
  useEffect(() => {
    if (activeTab === "users" && users.length === 0) {
      loadUsers()
    }
  }, [activeTab])

  async function loadUsers() {
    setUsersLoading(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/users`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } finally {
      setUsersLoading(false)
    }
  }

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
        enabled: local.enabled,
        customLimits: Object.values(customLimits).every(v => v === null) ? null : customLimits,
      }
      if (mod.tenantModuleId) body.tenantModuleId = mod.tenantModuleId
      else body.moduleId = mod.moduleId

      const res = await fetch(`/api/admin/clients/${clientId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Ошибка сохранения")
        return
      }
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: mod.moduleId, enabled: true }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Ошибка подключения")
        return
      }
      const data: ModuleItem[] = await fetch(`/api/admin/clients/${clientId}/modules`).then(r => r.json())
      setModules(data)
      for (const m of data) {
        if (m.moduleId === mod.moduleId) {
          setLocalMods(prev => ({
            ...prev,
            [m.moduleId]: {
              enabled: m.enabled,
              planId: m.planId ?? "none",
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

  async function patchSubscription(patch: {
    subscriptionStatus?: string; trialEndsAt?: string | null; currentPlanId?: string | null
  }) {
    setSubSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Ошибка сохранения")
        return
      }
      const updated = await res.json()
      setCompany(prev => prev ? {
        ...prev,
        subscriptionStatus: updated.subscriptionStatus ?? prev.subscriptionStatus,
        trialEndsAt: updated.trialEndsAt ?? prev.trialEndsAt,
        planId: updated.currentPlanId ?? prev.planId,
      } : prev)
    } catch {
      setError("Ошибка сохранения")
    } finally {
      setSubSaving(false)
    }
  }

  async function handleBlockCompany() {
    const isBlocked = company?.subscriptionStatus === "paused"
    const res = await fetch(`/api/admin/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionStatus: isBlocked ? "active" : "paused" }),
    })
    if (res.ok) {
      setCompany(prev => prev ? { ...prev, subscriptionStatus: isBlocked ? "active" : "paused" } : prev)
    }
  }

  async function handleDeleteCompany() {
    const res = await fetch(`/api/admin/clients/${clientId}`, { method: "DELETE" })
    if (res.ok) {
      window.location.href = "/admin/clients"
    } else {
      const d = await res.json()
      setError(d.error ?? "Ошибка удаления")
    }
  }

  async function handlePatchUser(userId: string, patch: { role?: string; isActive?: boolean }) {
    const res = await fetch(`/api/admin/clients/${clientId}/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u))
    }
  }

  async function handleDeleteUser(userId: string) {
    const res = await fetch(`/api/admin/clients/${clientId}/users/${userId}`, { method: "DELETE" })
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== userId))
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

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

  const status = STATUS_LABELS[company?.subscriptionStatus ?? ""] ?? {
    label: company?.subscriptionStatus ?? "—", cls: ""
  }
  const isBlocked = company?.subscriptionStatus === "paused"
  const canDelete = company?.subscriptionStatus !== "active"

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-4xl space-y-6">

            {/* Шапка */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
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
                      {company?.inn && <span className="text-xs text-muted-foreground">ИНН {company.inn}</span>}
                      <Badge variant="outline" className={cn("text-xs", status.cls)}>{status.label}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Действия */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1.5", isBlocked
                    ? "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    : "text-amber-700 border-amber-300 hover:bg-amber-50"
                  )}
                  onClick={handleBlockCompany}
                >
                  {isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {isBlocked ? "Разблокировать" : "Заблокировать"}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                      disabled={!canDelete}
                      title={!canDelete ? "Нельзя удалить компанию с активной подпиской" : undefined}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Удалить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить компанию?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Это действие необратимо. Компания «{company?.name}» и все её данные будут удалены.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleDeleteCompany}
                      >
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Глобальная ошибка */}
            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            {/* Вкладки */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="overview" className="gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Обзор
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Пользователи
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  Счета
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Активность
                </TabsTrigger>
              </TabsList>

              {/* ─── Обзор ─── */}
              <TabsContent value="overview" className="space-y-6">

                {/* Информация о компании */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Информация о компании</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      {[
                        { label: "Название",    value: company?.name },
                        { label: "ИНН",         value: company?.inn ?? "—" },
                        { label: "КПП",         value: company?.kpp ?? "—" },
                        { label: "Город",       value: company?.city ?? "—" },
                        { label: "Отрасль",     value: company?.industry ?? "—" },
                        { label: "Email",       value: company?.billingEmail ?? "—" },
                        { label: "Адрес",       value: company?.legalAddress ?? "—" },
                        { label: "Пользователей", value: company?.userCount },
                        { label: "Дата создания", value: company?.createdAt
                            ? new Date(company.createdAt).toLocaleDateString("ru-RU")
                            : "—" },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-medium text-foreground mt-0.5">{String(value ?? "—")}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>

                {/* Управление подпиской */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Управление подпиской</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-muted-foreground">Статус:</span>
                      <Badge variant="outline" className={cn("text-xs", status.cls)}>{status.label}</Badge>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Дата окончания trial</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          className="h-8 text-sm border rounded px-2 bg-background flex-1 max-w-[180px]"
                          value={trialEndsAt}
                          onChange={e => setTrialEndsAt(e.target.value)}
                        />
                        <Button
                          size="sm" variant="outline" className="gap-1.5 h-8"
                          disabled={subSaving || !trialEndsAt}
                          onClick={() => patchSubscription({ trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null })}
                        >
                          <Save className="w-3 h-3" />
                          Сохранить
                        </Button>
                      </div>
                    </div>

                    <Button
                      size="sm" variant="outline" className="gap-1.5"
                      disabled={subSaving}
                      onClick={() => {
                        const base = company?.trialEndsAt ? new Date(company.trialEndsAt) : new Date()
                        const newDate = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000)
                        const iso = newDate.toISOString()
                        setTrialEndsAt(iso.split("T")[0])
                        patchSubscription({ trialEndsAt: iso })
                      }}
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      Продлить на 14 дней
                    </Button>

                    <div className="flex flex-wrap gap-2 pt-1 border-t">
                      <Button
                        size="sm" variant="outline"
                        className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        disabled={subSaving || company?.subscriptionStatus === "active"}
                        onClick={() => patchSubscription({ subscriptionStatus: "active" })}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Активировать
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                        disabled={subSaving || company?.subscriptionStatus === "trial"}
                        onClick={() => patchSubscription({ subscriptionStatus: "trial" })}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Сбросить в trial
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Тариф и модули */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Тариф и модули</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {company?.plan && (
                      <div className="mb-4 p-3 rounded-lg bg-muted/40 border">
                        <p className="text-sm font-medium">{company.plan.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {company.plan.priceFormatted.toLocaleString("ru-RU")} ₽ / мес
                        </p>
                      </div>
                    )}

                    <Accordion type="multiple" className="w-full">
                      {modules.map(mod => {
                        const local    = localMods[mod.moduleId]
                        const colCls   = COLOR_MAP[mod.color] ?? COLOR_MAP.gray
                        const badgeCls = COLOR_BADGE[mod.color] ?? COLOR_BADGE.gray
                        const isSaving = savingId === mod.moduleId
                        const isSaved  = savedId  === mod.moduleId
                        const isEnabled = local?.enabled ?? mod.enabled

                        return (
                          <AccordionItem key={mod.moduleId} value={mod.moduleId}
                            className={cn("border-b last:border-b-0 rounded-none", !isEnabled && "opacity-60")}
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
                                <div className="flex items-center gap-3">
                                  <p className="text-sm text-muted-foreground flex-1">
                                    Модуль не подключён для этого клиента
                                  </p>
                                  <Button
                                    size="sm" variant="outline" className="gap-2 shrink-0"
                                    disabled={isSaving}
                                    onClick={() => handleConnect(mod)}
                                  >
                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    Подключить
                                  </Button>
                                </div>
                              ) : (
                                <>
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
                                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {(local?.enabled ?? mod.enabled) && (
                                    <div className="space-y-2 pt-1 border-t">
                                      <p className="text-xs font-medium text-muted-foreground pt-1">Использование</p>
                                      <UsageBar label="Вакансии" used={mod.usage.vacancies} limit={mod.limits?.max_vacancies} />
                                      <UsageBar label="Кандидаты" used={mod.usage.candidates} limit={mod.limits?.max_candidates} />
                                      <UsageBar label="Сотрудники" used={mod.usage.employees} limit={mod.limits?.max_employees} />
                                    </div>
                                  )}

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
                                            type="number" placeholder="∞" className="h-8 text-sm"
                                            value={local?.customLimits?.[field] ?? ""}
                                            onChange={e => setModLimit(mod.moduleId, field, e.target.value)}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 pt-1">
                                    <Button size="sm" onClick={() => handleSave(mod)} disabled={isSaving} className="gap-2">
                                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                      Сохранить
                                    </Button>
                                    {isSaved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
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
              </TabsContent>

              {/* ─── Пользователи ─── */}
              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Пользователи компании
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {usersLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Пользователь</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Роль</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Действия</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.length === 0 && (
                              <tr>
                                <td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                                  Нет пользователей
                                </td>
                              </tr>
                            )}
                            {users.map(user => (
                              <tr key={user.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Select
                                    value={user.role}
                                    onValueChange={role => handlePatchUser(user.id, { role })}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[150px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CLIENT_ROLES.map(r => (
                                        <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Badge
                                    variant="outline"
                                    className={cn("text-xs", user.isActive !== false
                                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                                      : "bg-muted text-muted-foreground border-border"
                                    )}
                                  >
                                    {user.isActive !== false ? "Активен" : "Заблокирован"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="icon" variant="ghost"
                                      className={cn("h-7 w-7", user.isActive !== false
                                        ? "text-muted-foreground hover:text-amber-600"
                                        : "text-emerald-600 hover:text-emerald-700"
                                      )}
                                      title={user.isActive !== false ? "Заблокировать" : "Разблокировать"}
                                      onClick={() => handlePatchUser(user.id, { isActive: user.isActive === false })}
                                    >
                                      {user.isActive !== false
                                        ? <UserX className="w-3.5 h-3.5" />
                                        : <UserCheck className="w-3.5 h-3.5" />}
                                    </Button>

                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="icon" variant="ghost"
                                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                          title="Удалить пользователя"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Пользователь «{user.name}» будет удалён. Это действие необратимо.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Отмена</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={() => handleDeleteUser(user.id)}
                                          >
                                            Удалить
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Счета ─── */}
              <TabsContent value="invoices">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Receipt className="w-4 h-4" />
                      История счетов
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>История счетов пока недоступна</p>
                      <p className="text-xs mt-1">Будет добавлена в следующем обновлении</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Активность ─── */}
              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Журнал активности
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>В разработке</p>
                      <p className="text-xs mt-1">Журнал активности компании будет доступен в следующем релизе</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
