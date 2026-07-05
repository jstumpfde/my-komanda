"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import { Progress } from "@/components/ui/progress"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft, Building2, Loader2, Save, Plus, CalendarDays, RotateCcw,
  CheckCircle, Lock, Unlock, Trash2, Users, Receipt, Activity, LayoutGrid,
  UserX, UserCheck, Shield, Handshake, Unlink, ShoppingCart, KeyRound, Copy, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PricingGrid, type ProductPricingRow, type BundleRow } from "@/components/admin/pricing-grid"
import { computeBundlePrice } from "@/lib/pricing/calc"

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
  id: string; name: string; fullName: string | null
  inn: string | null; kpp: string | null; ogrn: string | null
  legalAddress: string | null; officeAddress: string | null; postalAddress: string | null
  city: string | null; industry: string | null
  billingEmail: string | null; subscriptionStatus: string | null
  planId: string | null; currentPlanId: string | null; trialEndsAt: string | null
  createdAt: string | null; userCount: number
  plan: { id: string; name: string; price: number; slug: string; priceFormatted: number } | null
  partnerName: string | null; partnerIntegratorId: string | null; linkStatus: string | null
  // Per-company оверрайд видимых модулей сайдбара (companies.enabled_modules).
  // null = grandfather (модули по роли); непустой массив = ровно эти модули.
  enabledModules: string[] | null
  // Ответственные менеджеры (drizzle/0218).
  salesManagerId: string | null
  accountManagerId: string | null
}

// Ключи и русские лейблы модулей для секции «Модули в меню (сайдбар)».
// Порядок и ключи должны совпадать с ModuleId (lib/modules/types.ts).
const SIDEBAR_MODULES: { key: string; label: string }[] = [
  { key: "hr",        label: "HR" },
  { key: "sales",     label: "CRM" },
  { key: "knowledge", label: "Знания" },
  { key: "learning",  label: "Обучение" },
  { key: "tasks",     label: "Задачи" },
  { key: "marketing", label: "Маркетинг" },
  { key: "b2b",       label: "B2B" },
  { key: "warehouse", label: "Склад" },
  { key: "logistics", label: "Логистика" },
  { key: "booking",   label: "Бронирование" },
  { key: "dialer",    label: "AI-агент" },
  { key: "qc",        label: "ОКК" },
  { key: "price_monitor", label: "Мониторинг цен" },
]

// Партнёр (integrator) — для селекта назначения партнёра компании.
interface PartnerOption {
  id: string
  companyName: string | null
}

// Поля-реквизиты, редактируемые в форме «Информация о компании».
interface CompanyForm {
  name: string; fullName: string; inn: string; kpp: string; ogrn: string
  legalAddress: string; officeAddress: string; postalAddress: string
  city: string; industry: string; billingEmail: string
  subscriptionStatus: string; planId: string
}

const SUBSCRIPTION_OPTIONS: { value: string; label: string }[] = [
  { value: "trial",     label: "Trial" },
  { value: "active",    label: "Активен" },
  { value: "paused",    label: "Пауза" },
  { value: "cancelled", label: "Отменён" },
  { value: "expired",   label: "Истёк" },
]

function companyToForm(c: Company): CompanyForm {
  return {
    name:               c.name ?? "",
    fullName:           c.fullName ?? "",
    inn:                c.inn ?? "",
    kpp:                c.kpp ?? "",
    ogrn:               c.ogrn ?? "",
    legalAddress:       c.legalAddress ?? "",
    officeAddress:      c.officeAddress ?? "",
    postalAddress:      c.postalAddress ?? "",
    city:               c.city ?? "",
    industry:           c.industry ?? "",
    billingEmail:       c.billingEmail ?? "",
    subscriptionStatus: c.subscriptionStatus ?? "trial",
    planId:             c.currentPlanId ?? c.planId ?? "none",
  }
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

// ─── Типы для счетов и активности ────────────────────────────────────────────

interface InvoiceItem {
  id: string; invoiceNumber: string; amountRub: number | null
  periodStart: string | null; periodEnd: string | null
  status: string; dueDate: string | null; paidAt: string | null
  issuedAt: string | null; planName: string | null; createdAt: string | null
}

interface ActivityItem {
  id: string; action: string; entityType: string | null; entityId: string | null
  count: number | null; meta: Record<string, unknown> | null; ip: string | null
  createdAt: string; userId: string | null; userEmail: string | null; userName: string | null
}

const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Ожидает",     cls: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  issued:    { label: "Выставлен",   cls: "bg-blue-500/10 text-blue-700 border-blue-200" },
  paid:      { label: "Оплачен",     cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Аннулирован", cls: "bg-muted text-muted-foreground border-border" },
}

function fmtDate(v: string | null) {
  if (!v) return "—"
  return new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function fmtRub(v: number | null) {
  if (v == null) return "—"
  return v.toLocaleString("ru-RU") + " ₽"
}

function fmtPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "—"
  return `${fmtDate(start)} — ${fmtDate(end)}`
}

function ACTION_LABEL(action: string) {
  const map: Record<string, string> = {
    candidate_export:        "Экспорт кандидатов",
    candidate_delete:        "Удаление кандидата",
    candidate_view_contacts: "Просмотр контактов",
    candidate_bulk_update:   "Массовое обновление",
  }
  return map[action] ?? action
}

// ─── Компонент: Счета клиента ─────────────────────────────────────────────────

function ClientInvoicesPanel({ clientId }: { clientId: string }) {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/clients/${clientId}/invoices`)
      .then(r => r.json())
      .then(data => setInvoices(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )

  if (invoices.length === 0) return (
    <div className="text-center py-10 text-sm text-muted-foreground">
      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p>Счетов пока нет</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <DataTable>
        <DataHead>
          <DataHeadCell>Номер</DataHeadCell>
          <DataHeadCell>Тариф</DataHeadCell>
          <DataHeadCell align="right">Сумма</DataHeadCell>
          <DataHeadCell>Период</DataHeadCell>
          <DataHeadCell align="center">Статус</DataHeadCell>
          <DataHeadCell>Срок</DataHeadCell>
          <DataHeadCell>Оплачен</DataHeadCell>
        </DataHead>
        <tbody>
          {invoices.map(inv => {
            const st = INVOICE_STATUS[inv.status] ?? { label: inv.status, cls: "" }
            return (
              <DataRow key={inv.id}>
                <DataCell className="font-medium whitespace-nowrap">{inv.invoiceNumber}</DataCell>
                <DataCell className="text-muted-foreground text-sm">{inv.planName ?? "—"}</DataCell>
                <DataCell align="right" className="font-medium whitespace-nowrap">{fmtRub(inv.amountRub)}</DataCell>
                <DataCell className="text-muted-foreground whitespace-nowrap">{fmtPeriod(inv.periodStart, inv.periodEnd)}</DataCell>
                <DataCell align="center">
                  <Badge variant="outline" className={cn("text-xs", st.cls)}>{st.label}</Badge>
                </DataCell>
                <DataCell className="whitespace-nowrap">{fmtDate(inv.dueDate)}</DataCell>
                <DataCell className="whitespace-nowrap">{fmtDate(inv.paidAt)}</DataCell>
              </DataRow>
            )
          })}
        </tbody>
      </DataTable>
    </div>
  )
}

// ─── Компонент: Журнал активности ─────────────────────────────────────────────

function ClientActivityPanel({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/clients/${clientId}/activity`)
      .then(r => r.json())
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )

  if (events.length === 0) return (
    <div className="text-center py-10 text-sm text-muted-foreground">
      <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p>Событий аудита пока нет</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <DataTable>
        <DataHead>
          <DataHeadCell>Время</DataHeadCell>
          <DataHeadCell>Пользователь</DataHeadCell>
          <DataHeadCell>Действие</DataHeadCell>
          <DataHeadCell>Объект</DataHeadCell>
          <DataHeadCell>IP</DataHeadCell>
        </DataHead>
        <tbody>
          {events.map(ev => (
            <DataRow key={ev.id}>
              <DataCell className="whitespace-nowrap text-muted-foreground text-xs">
                {new Date(ev.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </DataCell>
              <DataCell>
                <div className="text-sm">{ev.userName ?? ev.userEmail ?? "—"}</div>
                {ev.userEmail && ev.userName && (
                  <div className="text-xs text-muted-foreground">{ev.userEmail}</div>
                )}
              </DataCell>
              <DataCell className="text-sm font-medium">{ACTION_LABEL(ev.action)}</DataCell>
              <DataCell className="text-muted-foreground text-xs">
                {ev.entityType ? `${ev.entityType}${ev.entityId ? ` #${ev.entityId.slice(0, 8)}` : ""}` : "—"}
                {ev.count != null && ` (${ev.count})`}
              </DataCell>
              <DataCell className="text-muted-foreground text-xs whitespace-nowrap">{ev.ip ?? "—"}</DataCell>
            </DataRow>
          ))}
        </tbody>
      </DataTable>
    </div>
  )
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

// ─── Компонент: Ответственные менеджеры ──────────────────────────────────────

interface ManagerOption { id: string; name: string; email: string; role: string }
interface CommissionRate { role: string; salePercent: string; accompanimentPercent: string }

function ManagersCard({ clientId, company }: { clientId: string; company: Company | null }) {
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [rates, setRates] = useState<CommissionRate[]>([])
  const [salesId, setSalesId] = useState<string>("")
  const [accountId, setAccountId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  // Загрузка списка менеджеров и ставок параллельно
  useEffect(() => {
    fetch("/api/admin/managers")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.managers) setManagers(data.managers) })
      .catch(() => {})
    fetch("/api/admin/manager-rates")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.rates) setRates(data.rates) })
      .catch(() => {})
  }, [])

  // Инициализируем селекты из данных компании
  useEffect(() => {
    setSalesId(company?.salesManagerId ?? "")
    setAccountId(company?.accountManagerId ?? "")
  }, [company?.salesManagerId, company?.accountManagerId])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError("")
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/assign-manager`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesManagerId:   salesId || null,
          accountManagerId: accountId || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Ошибка сохранения")
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  // Подсказка со ставками
  const salesRate   = rates.find(r => r.role === "sales_manager")
  const accountRate = rates.find(r => r.role === "account_manager")
  const ratesHint = [
    salesRate   ? `Менеджер продаж: ${salesRate.salePercent}% продажа + ${salesRate.accompanimentPercent}% сопровождение` : null,
    accountRate ? `Клиентский: ${accountRate.accompanimentPercent}% сопровождение` : null,
  ].filter(Boolean).join("; ")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" /> Ответственные менеджеры
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ratesHint && (
          <p className="text-xs text-muted-foreground">{ratesHint}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Менеджер продаж</Label>
            <Select value={salesId || "none"} onValueChange={v => setSalesId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="— не назначен —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— не назначен —</SelectItem>
                {managers.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} <span className="text-muted-foreground text-xs">({m.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Клиентский менеджер</Label>
            <Select value={accountId || "none"} onValueChange={v => setAccountId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="— не назначен —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— не назначен —</SelectItem>
                {managers.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} <span className="text-muted-foreground text-xs">({m.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
          {saved  && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
          {error  && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
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

  // Форма реквизитов компании
  const [form, setForm] = useState<CompanyForm | null>(null)
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)

  // Продукты и прайсинг
  const [planPricing, setPlanPricing] = useState<ProductPricingRow[]>([])
  const [planDiscounts, setPlanDiscounts] = useState<BundleRow[]>([])
  const [productAssignments, setProductAssignments] = useState<Record<string, {
    enabled: boolean; priceOverrideKopecks: string
  }>>({})
  const [productsSaving, setProductsSaving] = useState(false)
  const [productsSaved, setProductsSaved] = useState(false)
  const [productsError, setProductsError] = useState("")
  const [assignResult, setAssignResult] = useState<{
    subtotalKopecks: number; productCount: number; discountPercent: number
    discountKopecks: number; totalKopecks: number
  } | null>(null)

  // Партнёр компании
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [partnerSelect, setPartnerSelect] = useState<string>("none")
  const [partnerSaving, setPartnerSaving] = useState(false)

  // Сброс пароля пользователя
  const [resetPwdUserId, setResetPwdUserId]     = useState<string | null>(null)
  const [resetPwdLoading, setResetPwdLoading]   = useState(false)
  const [resetPwdResult, setResetPwdResult]     = useState<string | null>(null)
  const [resetPwdError, setResetPwdError]       = useState<string | null>(null)
  const [resetPwdCopied, setResetPwdCopied]     = useState(false)

  // Модули в меню (companies.enabled_modules). overrideOn=false → grandfather
  // (NULL, модули по роли). overrideOn=true → показываем РОВНО selectedModules.
  const [overrideOn, setOverrideOn] = useState(false)
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set())
  const [modulesSaving, setModulesSaving] = useState(false)
  const [modulesSaved, setModulesSaved] = useState(false)

  // Загружаем компанию
  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}`)
      .then(r => r.json())
      .then(data => {
        setCompany(data)
        setForm(companyToForm(data))
        setPartnerSelect(data?.partnerIntegratorId ?? "none")
        // Инициализация секции «Модули в меню»: непустой массив → оверрайд вкл.
        const em: string[] | null = Array.isArray(data?.enabledModules) ? data.enabledModules : null
        setOverrideOn(!!em && em.length > 0)
        setSelectedModules(new Set(em && em.length > 0 ? em : SIDEBAR_MODULES.map(m => m.key)))
        if (data?.trialEndsAt) {
          setTrialEndsAt(new Date(data.trialEndsAt).toISOString().split("T")[0])
        }
      })
      .catch(() => {})
  }, [clientId])

  // Загружаем партнёров платформы (для назначения).
  useEffect(() => {
    fetch(`/api/admin/integrators`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.integrators) {
          setPartners(data.integrators.map((i: { id: string; companyName: string | null }) => ({
            id: i.id, companyName: i.companyName,
          })))
        }
      })
      .catch(() => {})
  }, [])

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
        // 403/ошибка отдают объект {error} — без гарда for..of/map роняли
        // всю карточку клиента в error boundary (инцидент 03.07).
        if (!Array.isArray(data)) {
          setError((data as unknown as { error?: string })?.error || "Не удалось загрузить модули")
          return
        }
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

  // Загружаем цены плана клиента при смене плана
  useEffect(() => {
    const planId = company?.currentPlanId ?? company?.planId
    if (!planId) return
    fetch(`/api/admin/plans/${planId}/pricing`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const products: ProductPricingRow[] = data.products ?? []
        const discounts: BundleRow[] = data.discounts ?? []
        setPlanPricing(products)
        setPlanDiscounts(discounts)
        // Инициализируем назначения: всем enabled=false, override пуст
        setProductAssignments(prev => {
          const next: typeof prev = {}
          for (const p of products) {
            next[p.moduleId] = prev[p.moduleId] ?? { enabled: false, priceOverrideKopecks: "" }
          }
          return next
        })
      })
      .catch(() => {})
  }, [company?.currentPlanId, company?.planId])

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
      // Держим селект статуса в форме реквизитов в синхроне.
      if (updated.subscriptionStatus) {
        setForm(prev => prev ? { ...prev, subscriptionStatus: updated.subscriptionStatus } : prev)
      }
    } catch {
      setError("Ошибка сохранения")
    } finally {
      setSubSaving(false)
    }
  }

  function setFormField(field: keyof CompanyForm, value: string) {
    setForm(prev => prev ? { ...prev, [field]: value } : prev)
  }

  async function handleSaveInfo() {
    if (!form) return
    setInfoSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:               form.name,
          fullName:           form.fullName,
          inn:                form.inn,
          kpp:                form.kpp,
          ogrn:               form.ogrn,
          legalAddress:       form.legalAddress,
          officeAddress:      form.officeAddress,
          postalAddress:      form.postalAddress,
          city:               form.city,
          industry:           form.industry,
          billingEmail:       form.billingEmail,
          subscriptionStatus: form.subscriptionStatus,
          planId:             form.planId === "none" ? null : form.planId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Ошибка сохранения")
        return
      }
      const updated = await res.json()
      setCompany(prev => prev ? { ...prev, ...updated } : prev)
      setInfoSaved(true)
      setTimeout(() => setInfoSaved(false), 2500)
    } catch {
      setError("Ошибка сохранения")
    } finally {
      setInfoSaving(false)
    }
  }

  function toggleModule(key: string, on: boolean) {
    setSelectedModules(prev => {
      const next = new Set(prev)
      if (on) next.add(key); else next.delete(key)
      return next
    })
  }

  // Сохранить «Модули в меню» (companies.enabled_modules).
  // overrideOn=false → null (grandfather). overrideOn=true → массив выбранных
  // (пустой выбор API трактует как сброс в null). hr форсим всегда.
  async function handleSaveModules() {
    setModulesSaving(true)
    setError("")
    try {
      const payload: string[] | null = overrideOn
        ? Array.from(new Set<string>(["hr", ...selectedModules]))
        : null
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModules: payload }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Ошибка сохранения модулей")
        return
      }
      const updated = await res.json()
      const em: string[] | null = Array.isArray(updated?.enabledModules) ? updated.enabledModules : null
      setCompany(prev => prev ? { ...prev, enabledModules: em } : prev)
      setOverrideOn(!!em && em.length > 0)
      setSelectedModules(new Set(em && em.length > 0 ? em : SIDEBAR_MODULES.map(m => m.key)))
      setModulesSaved(true)
      setTimeout(() => setModulesSaved(false), 2500)
    } catch {
      setError("Ошибка сохранения модулей")
    } finally {
      setModulesSaving(false)
    }
  }

  // Назначить / сменить партнёра компании. reassign=true отменяет связь с
  // предыдущим партнёром (POST с reassign:true на новом партнёре).
  async function handleAssignPartner(reassign = false) {
    if (partnerSelect === "none") return
    setPartnerSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/integrators/${partnerSelect}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientCompanyId: clientId, reassign }),
      })
      if (res.status === 409 && !reassign) {
        if (window.confirm("Компания уже привязана к другому партнёру. Перепривязать к выбранному?")) {
          setPartnerSaving(false)
          await handleAssignPartner(true)
          return
        }
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Не удалось назначить партнёра")
        return
      }
      const sel = partners.find(p => p.id === partnerSelect)
      setCompany(prev => prev ? {
        ...prev,
        partnerIntegratorId: partnerSelect,
        partnerName: sel?.companyName ?? prev.partnerName,
        linkStatus: "active",
      } : prev)
    } catch {
      setError("Ошибка сети")
    } finally {
      setPartnerSaving(false)
    }
  }

  // Отвязать текущего партнёра компании (status='cancelled').
  async function handleUnlinkPartner() {
    if (!company?.partnerIntegratorId) return
    setPartnerSaving(true)
    setError("")
    try {
      // У админ-роута отвязки нужен linkId; берём его из списка клиентов партнёра.
      const list = await fetch(`/api/admin/integrators/${company.partnerIntegratorId}/clients`).then(r => r.json())
      const link = (list.clients ?? []).find(
        (c: { id: string; clientCompanyId: string; status: string | null }) =>
          c.clientCompanyId === clientId && c.status === "active",
      )
      if (!link) { setError("Активная связь не найдена"); return }
      const res = await fetch(`/api/admin/integrators/${company.partnerIntegratorId}/clients/${link.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Не удалось отвязать")
        return
      }
      setCompany(prev => prev ? { ...prev, partnerIntegratorId: null, partnerName: null, linkStatus: null } : prev)
      setPartnerSelect("none")
    } catch {
      setError("Ошибка сети")
    } finally {
      setPartnerSaving(false)
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
      const next = isBlocked ? "active" : "paused"
      setCompany(prev => prev ? { ...prev, subscriptionStatus: next } : prev)
      setForm(prev => prev ? { ...prev, subscriptionStatus: next } : prev)
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

  function openResetPwdDialog(userId: string) {
    setResetPwdUserId(userId)
    setResetPwdResult(null)
    setResetPwdError(null)
    setResetPwdCopied(false)
  }

  function closeResetPwdDialog() {
    setResetPwdUserId(null)
    setResetPwdResult(null)
    setResetPwdError(null)
    setResetPwdCopied(false)
  }

  async function handleResetPassword() {
    if (!resetPwdUserId) return
    setResetPwdLoading(true)
    setResetPwdError(null)
    try {
      const res = await fetch(
        `/api/admin/clients/${clientId}/users/${resetPwdUserId}/reset-password`,
        { method: "POST" }
      )
      const json = await res.json()
      if (!res.ok) {
        setResetPwdError(json?.error ?? "Ошибка сброса пароля")
      } else {
        setResetPwdResult(json?.password ?? "")
      }
    } catch {
      setResetPwdError("Ошибка соединения")
    } finally {
      setResetPwdLoading(false)
    }
  }

  async function handleCopyResetPwd() {
    if (!resetPwdResult) return
    await navigator.clipboard.writeText(resetPwdResult)
    setResetPwdCopied(true)
    setTimeout(() => setResetPwdCopied(false), 2000)
  }

  async function handleSaveProducts() {
    setProductsSaving(true)
    setProductsError("")
    setProductsSaved(false)
    try {
      const products = planPricing
        .filter(p => p.isActive)
        .map(p => {
          const a = productAssignments[p.moduleId]
          const override = a?.priceOverrideKopecks.trim()
          const parsed = override ? Math.round(parseFloat(override.replace(",", ".")) * 100) : undefined
          return {
            moduleId: p.moduleId,
            enabled: a?.enabled ?? false,
            ...(parsed != null && !isNaN(parsed) ? { priceOverrideKopecks: parsed } : {}),
          }
        })
      const res = await fetch(`/api/admin/clients/${clientId}/assign-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setProductsError(d.error ?? "Ошибка сохранения")
        return
      }
      const result = await res.json()
      setAssignResult({
        subtotalKopecks: result.subtotalKopecks,
        productCount: result.productCount,
        discountPercent: result.discountPercent,
        discountKopecks: result.discountKopecks,
        totalKopecks: result.totalKopecks,
      })
      setProductsSaved(true)
      setTimeout(() => setProductsSaved(false), 2500)
    } catch {
      setProductsError("Ошибка сети")
    } finally {
      setProductsSaving(false)
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminPageLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminPageLayout>
    )
  }

  const status = STATUS_LABELS[company?.subscriptionStatus ?? ""] ?? {
    label: company?.subscriptionStatus ?? "—", cls: ""
  }
  const isBlocked = company?.subscriptionStatus === "paused"
  const canDelete = company?.subscriptionStatus !== "active"

  return (
    <AdminPageLayout>
          <div className="py-6 space-y-6 px-8">

            {/* Шапка */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                  <Link href="/admin/clients"><ArrowLeft className="w-4 h-4" /></Link>
                </Button>
                <div className="flex items-center gap-2.5">
                  <div>
                    <div className="flex items-center gap-2 pt-3 pb-2">
                      <Building2 className="h-5 w-5 text-violet-600" />
                      <h1 className="text-lg font-semibold">{company?.name ?? "Клиент"}</h1>
                    </div>
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
                  <CardContent className="space-y-4">
                    {form && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                          {([
                            { field: "name",          label: "Название",          ph: "Короткое название" },
                            { field: "fullName",      label: "Полное наименование", ph: "ООО «…»" },
                            { field: "inn",           label: "ИНН",               ph: "" },
                            { field: "kpp",           label: "КПП",               ph: "" },
                            { field: "ogrn",          label: "ОГРН",              ph: "" },
                            { field: "city",          label: "Город",             ph: "" },
                            { field: "industry",      label: "Отрасль",           ph: "" },
                            { field: "billingEmail",  label: "Email для счетов",  ph: "billing@…" },
                          ] as { field: keyof CompanyForm; label: string; ph: string }[]).map(({ field, label, ph }) => (
                            <div key={field} className="space-y-1.5">
                              <Label htmlFor={`f-${field}`} className="text-xs text-muted-foreground">{label}</Label>
                              <Input
                                id={`f-${field}`}
                                className="h-8 text-sm"
                                placeholder={ph}
                                value={form[field]}
                                onChange={e => setFormField(field, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 gap-y-3">
                          {([
                            { field: "legalAddress",  label: "Юридический адрес" },
                            { field: "officeAddress", label: "Адрес офиса" },
                            { field: "postalAddress", label: "Почтовый адрес" },
                          ] as { field: keyof CompanyForm; label: string }[]).map(({ field, label }) => (
                            <div key={field} className="space-y-1.5">
                              <Label htmlFor={`f-${field}`} className="text-xs text-muted-foreground">{label}</Label>
                              <Input
                                id={`f-${field}`}
                                className="h-8 text-sm"
                                value={form[field]}
                                onChange={e => setFormField(field, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Статус подписки</Label>
                            <Select
                              value={form.subscriptionStatus}
                              onValueChange={v => setFormField("subscriptionStatus", v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Статус" />
                              </SelectTrigger>
                              <SelectContent>
                                {SUBSCRIPTION_OPTIONS.map(o => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Тариф</Label>
                            <Select
                              value={form.planId}
                              onValueChange={v => setFormField("planId", v)}
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
                        </div>

                        {/* Только для чтения */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-1 border-t">
                          <div>
                            <p className="text-xs text-muted-foreground">Пользователей</p>
                            <p className="font-medium text-foreground mt-0.5">{company?.userCount ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Дата создания</p>
                            <p className="font-medium text-foreground mt-0.5">
                              {company?.createdAt ? new Date(company.createdAt).toLocaleDateString("ru-RU") : "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <Button onClick={handleSaveInfo} disabled={infoSaving || !form.name.trim()} className="gap-2">
                            {infoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Сохранить
                          </Button>
                          {infoSaved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Партнёр */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Handshake className="w-4 h-4" /> Партнёр
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                      <span className="text-muted-foreground">Текущий партнёр:</span>
                      {company?.partnerName
                        ? <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-700 border-violet-200">{company.partnerName}</Badge>
                        : <span className="text-muted-foreground">— не привязан —</span>}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {company?.partnerIntegratorId ? "Сменить партнёра" : "Назначить партнёра"}
                      </Label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={partnerSelect} onValueChange={setPartnerSelect}>
                          <SelectTrigger className="h-8 text-sm flex-1 min-w-[220px] max-w-sm">
                            <SelectValue placeholder="Выберите партнёра" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Не выбран —</SelectItem>
                            {partners.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.companyName ?? p.id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm" variant="outline" className="gap-1.5 h-8"
                          disabled={partnerSaving || partnerSelect === "none" || partnerSelect === company?.partnerIntegratorId}
                          onClick={() => handleAssignPartner(false)}
                        >
                          {partnerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          {company?.partnerIntegratorId ? "Сменить" : "Назначить"}
                        </Button>
                        {company?.partnerIntegratorId && (
                          <Button
                            size="sm" variant="ghost"
                            className="gap-1.5 h-8 text-destructive hover:text-destructive"
                            disabled={partnerSaving}
                            onClick={handleUnlinkPartner}
                          >
                            <Unlink className="w-3.5 h-3.5" /> Отвязать
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Ответственные менеджеры */}
                <ManagersCard clientId={clientId} company={company} />

                {/* Модули в меню (сайдбар) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4" /> Модули в меню
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Управляет тем, какие модули видит клиент в боковом меню. Это
                      видимость пунктов меню — отдельно от лимитов тарифа в блоке
                      «Тариф и модули» ниже.
                    </p>

                    <div className="flex items-start gap-3">
                      <Switch
                        id="modules-override"
                        checked={overrideOn}
                        onCheckedChange={setOverrideOn}
                      />
                      <Label htmlFor="modules-override" className="cursor-pointer space-y-0.5">
                        <span className="block text-sm font-medium">Переопределить набор модулей</span>
                        <span className="block text-xs text-muted-foreground font-normal">
                          Выключено — модули показываются по роли (как сейчас).
                          Включено — клиент видит ровно отмеченные модули.
                        </span>
                      </Label>
                    </div>

                    {overrideOn && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 pt-1 border-t">
                        {SIDEBAR_MODULES.map(({ key, label }) => {
                          const isHr = key === "hr"
                          const checked = isHr || selectedModules.has(key)
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <Checkbox
                                id={`mod-${key}`}
                                checked={checked}
                                disabled={isHr}
                                onCheckedChange={v => toggleModule(key, v === true)}
                              />
                              <Label
                                htmlFor={`mod-${key}`}
                                className={cn("text-sm cursor-pointer", isHr && "text-muted-foreground")}
                              >
                                {label}{isHr && " (всегда)"}
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <Button onClick={handleSaveModules} disabled={modulesSaving} className="gap-2">
                        {modulesSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Сохранить
                      </Button>
                      {modulesSaved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
                    </div>
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
                {/* Продукты и прайсинг */}
                {planPricing.filter(p => p.isActive).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" /> Продукты и прайсинг
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Выберите продукты, подключённые клиенту. Итог рассчитывается по ценам тарифа
                        со скидкой за набор.
                      </p>

                      {/* Список продуктов с тумблерами и опциональным override цены */}
                      <div className="space-y-2">
                        {planPricing.filter(p => p.isActive).map(row => {
                          const mod = modules.find(m => m.moduleId === row.moduleId)
                          const label = mod?.moduleName ?? row.moduleId
                          const a = productAssignments[row.moduleId] ?? { enabled: false, priceOverrideKopecks: "" }
                          return (
                            <div key={row.moduleId} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                              <Switch
                                id={`prod-${row.moduleId}`}
                                checked={a.enabled}
                                onCheckedChange={v =>
                                  setProductAssignments(prev => ({
                                    ...prev,
                                    [row.moduleId]: { ...prev[row.moduleId] ?? { priceOverrideKopecks: "" }, enabled: v },
                                  }))
                                }
                              />
                              <Label htmlFor={`prod-${row.moduleId}`} className="flex-1 cursor-pointer text-sm font-medium">
                                {label}
                              </Label>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {(row.priceKopecks / 100).toLocaleString("ru-RU")} ₽/мес
                              </span>
                              {a.enabled && (
                                <div className="flex items-center gap-1 ml-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Своя цена"
                                    className="h-7 w-28 text-sm text-right"
                                    value={a.priceOverrideKopecks}
                                    onChange={e =>
                                      setProductAssignments(prev => ({
                                        ...prev,
                                        [row.moduleId]: { ...prev[row.moduleId], priceOverrideKopecks: e.target.value },
                                      }))
                                    }
                                  />
                                  <span className="text-xs text-muted-foreground">₽</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Живой расчёт */}
                      {(() => {
                        const activeItems = planPricing
                          .filter(p => p.isActive && (productAssignments[p.moduleId]?.enabled))
                          .map(p => {
                            const a = productAssignments[p.moduleId]
                            const override = a?.priceOverrideKopecks?.trim()
                            const parsed = override ? Math.round(parseFloat(override.replace(",", ".")) * 100) : NaN
                            return { moduleId: p.moduleId, priceKopecks: !isNaN(parsed) ? parsed : p.priceKopecks }
                          })
                        const rules = planDiscounts
                          .filter(d => d.isActive)
                          .map(d => ({ minProducts: d.minProducts, maxProducts: d.maxProducts, discountPercent: d.discountPercent }))
                        const calc = computeBundlePrice(activeItems, rules)
                        if (activeItems.length === 0) return (
                          <p className="text-xs text-muted-foreground italic">
                            Включите хотя бы один продукт, чтобы увидеть расчёт.
                          </p>
                        )
                        return (
                          <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-4">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                              <span className="text-muted-foreground">
                                {calc.productCount} {calc.productCount === 1 ? "продукт" : calc.productCount < 5 ? "продукта" : "продуктов"}
                              </span>
                              <span className="font-medium tabular-nums">
                                {(calc.subtotalKopecks / 100).toLocaleString("ru-RU")} ₽
                              </span>
                              {calc.discountPercent > 0 && (
                                <>
                                  <span className="text-muted-foreground">−</span>
                                  <span className="text-emerald-600 font-medium">скидка {calc.discountPercent}%</span>
                                  <span className="text-muted-foreground tabular-nums">
                                    ({(calc.discountKopecks / 100).toLocaleString("ru-RU")} ₽)
                                  </span>
                                  <span className="text-muted-foreground">=</span>
                                </>
                              )}
                              <span className="text-base font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                                Итого {(calc.totalKopecks / 100).toLocaleString("ru-RU")} ₽/мес
                              </span>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Результат после сохранения */}
                      {assignResult && (
                        <div className="text-xs text-muted-foreground border-t pt-2">
                          Сохранено: {assignResult.productCount} прод. ·{" "}
                          {(assignResult.totalKopecks / 100).toLocaleString("ru-RU")} ₽/мес
                          {assignResult.discountPercent > 0 && ` (скидка ${assignResult.discountPercent}%)`}
                        </div>
                      )}

                      <div className="flex items-center gap-3 pt-1">
                        <Button onClick={handleSaveProducts} disabled={productsSaving} className="gap-2">
                          {productsSaving
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Save className="w-3.5 h-3.5" />}
                          Сохранить продукты
                        </Button>
                        {productsSaved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
                        {productsError && <span className="text-xs text-destructive">{productsError}</span>}
                      </div>
                    </CardContent>
                  </Card>
                )}
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
                      <DataTable>
                        <DataHead>
                          <DataHeadCell>Пользователь</DataHeadCell>
                          <DataHeadCell>Роль</DataHeadCell>
                          <DataHeadCell align="center">Статус</DataHeadCell>
                          <DataHeadCell align="right">Действия</DataHeadCell>
                        </DataHead>
                        <tbody>
                          {users.length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                                Нет пользователей
                              </td>
                            </tr>
                          )}
                          {users.map(user => (
                            <DataRow key={user.id}>
                              <DataCell>
                                <div>
                                  <p className="font-medium text-foreground">{user.name}</p>
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                              </DataCell>
                              <DataCell>
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
                              </DataCell>
                              <DataCell align="center">
                                <Badge
                                  variant="outline"
                                  className={cn("text-xs", user.isActive !== false
                                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                                    : "bg-muted text-muted-foreground border-border"
                                  )}
                                >
                                  {user.isActive !== false ? "Активен" : "Заблокирован"}
                                </Badge>
                              </DataCell>
                              <DataCell>
                                <div className="flex items-center justify-end gap-1">
                                  {/* Сброс пароля */}
                                  <Button
                                    size="icon" variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-violet-600"
                                    title="Сбросить пароль"
                                    onClick={() => openResetPwdDialog(user.id)}
                                  >
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </Button>

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
                              </DataCell>
                            </DataRow>
                          ))}
                        </tbody>
                      </DataTable>
                    )}
                  </CardContent>
                </Card>

                {/* ─── Диалог сброса пароля ─── */}
                <Dialog
                  open={resetPwdUserId !== null}
                  onOpenChange={open => { if (!open) closeResetPwdDialog() }}
                >
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-violet-600" />
                        Сброс пароля
                      </DialogTitle>
                      <DialogDescription>
                        {resetPwdResult
                          ? "Новый временный пароль сгенерирован. Передайте его пользователю — больше не покажем."
                          : "Будет сгенерирован новый временный пароль. Пользователь автоматически разблокируется."}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-3">
                      {resetPwdError && (
                        <p className="text-sm text-destructive">{resetPwdError}</p>
                      )}

                      {resetPwdResult ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Новый пароль
                          </p>
                          <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
                            <span className="font-mono text-sm flex-1 select-all break-all">
                              {resetPwdResult}
                            </span>
                            <Button
                              size="icon" variant="ghost"
                              className={cn("h-7 w-7 shrink-0", resetPwdCopied
                                ? "text-emerald-600"
                                : "text-muted-foreground hover:text-violet-600"
                              )}
                              title="Скопировать"
                              onClick={handleCopyResetPwd}
                            >
                              {resetPwdCopied
                                ? <Check className="w-3.5 h-3.5" />
                                : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                          <p className="text-xs text-amber-600 font-medium">
                            ⚠ Передайте пользователю — больше не покажем
                          </p>
                        </div>
                      ) : (
                        !resetPwdLoading && (
                          <p className="text-sm text-muted-foreground">
                            Текущий пароль будет аннулирован. Пользователь сможет войти только с новым временным паролем.
                          </p>
                        )
                      )}

                      {resetPwdLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Генерируем пароль…
                        </div>
                      )}
                    </div>

                    <DialogFooter>
                      {resetPwdResult ? (
                        <Button variant="outline" onClick={closeResetPwdDialog}>
                          Закрыть
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" onClick={closeResetPwdDialog} disabled={resetPwdLoading}>
                            Отмена
                          </Button>
                          <Button
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                            onClick={handleResetPassword}
                            disabled={resetPwdLoading}
                          >
                            {resetPwdLoading
                              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Генерируем…</>
                              : <><KeyRound className="w-4 h-4 mr-2" />Сбросить пароль</>}
                          </Button>
                        </>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                  <CardContent className="p-0 pb-2">
                    <ClientInvoicesPanel clientId={clientId} />
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
                  <CardContent className="p-0 pb-2">
                    <ClientActivityPanel clientId={clientId} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

          </div>
    </AdminPageLayout>
  )
}
