"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  AlertTriangle, Clock, Download, CreditCard, CheckCircle2, XCircle, Plus, FileText, Loader2,
} from "lucide-react"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  status: string
  trialEndsAt: string | null
  daysRemaining: number | null
  plan: {
    id: string
    name: string
    price: number
    slug: string
  } | null
}

interface PlanModule {
  id: string
  slug: string
  name: string
  maxVacancies: number | null
  maxCandidates: number | null
}

interface Plan {
  id: string
  slug: string
  name: string
  price: number
  currency: string | null
  interval: string | null
  sortOrder: number | null
  isArchived?: boolean
  trialDays?: number
  modules: PlanModule[]
}

interface Invoice {
  id: string
  invoiceNumber: string
  amountKopecks: number
  status: string
  issuedAt: string | null
  paidAt: string | null
  dueDate: string | null
  periodStart: string | null
  periodEnd: string | null
  planId: string | null
  createdAt: string | null
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function formatKopecks(kopecks: number): string {
  return `${Math.floor(kopecks / 100).toLocaleString("ru-RU")} ₽`
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU")
}

const STATUS_LABELS: Record<string, string> = {
  trial:     "Пробный",
  active:    "Активен",
  expired:   "Истёк",
  paused:    "На паузе",
  cancelled: "Отменён",
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending:   "Ожидает",
  draft:     "Черновик",
  issued:    "Выставлен",
  paid:      "Оплачен",
  cancelled: "Отменён",
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "trial":     return "bg-blue-500/10 text-blue-700 border-blue-200"
    case "active":    return "bg-emerald-500/10 text-emerald-700 border-emerald-200"
    case "expired":   return "bg-red-500/10 text-red-700 border-red-200"
    case "paused":    return "bg-amber-500/10 text-amber-700 border-amber-200"
    case "cancelled": return "bg-muted text-muted-foreground"
    default:          return "bg-muted text-muted-foreground"
  }
}

function invoiceStatusClass(status: string): string {
  switch (status) {
    case "paid":      return "bg-emerald-500/10 text-emerald-700 border-emerald-200"
    case "issued":
    case "pending":   return "bg-amber-500/10 text-amber-700 border-amber-200"
    case "draft":     return "bg-muted text-muted-foreground"
    case "cancelled": return "bg-red-500/10 text-red-700 border-red-200"
    default:          return "bg-muted text-muted-foreground"
  }
}

const PERIOD_OPTIONS = [
  { value: "month",   label: "1 месяц",   multiplier: 1 },
  { value: "quarter", label: "3 месяца",   multiplier: 3 },
  { value: "year",    label: "12 месяцев", multiplier: 12 },
]

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [allPlans, setAllPlans] = useState<Plan[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingSub, setLoadingSub] = useState(true)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingInvoices, setLoadingInvoices] = useState(true)

  // Confirm plan change dialog
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null)
  const [changingPlan, setChangingPlan] = useState(false)

  // Invoice creation dialog
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoicePlanId, setInvoicePlanId] = useState("")
  const [invoicePeriod, setInvoicePeriod] = useState("month")
  const [creatingInvoice, setCreatingInvoice] = useState(false)

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then(r => r.json())
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoadingSub(false))

    fetch("/api/plans")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: unknown) => {
        const plans = Array.isArray(data) ? data : []
        if (plans.length > 0) {
          setAllPlans(plans)
        } else {
          // Fallback defaults when DB has no plans
          setAllPlans([
            { id: "default-starter", slug: "starter", name: "Стартер", price: 490000, currency: "RUB", interval: "month", sortOrder: 0, modules: [{ id: "m1", slug: "hr", name: "HR и найм", maxVacancies: 3, maxCandidates: 500 }] },
            { id: "default-business", slug: "business", name: "Бизнес", price: 990000, currency: "RUB", interval: "month", sortOrder: 1, modules: [{ id: "m1", slug: "hr", name: "HR и найм", maxVacancies: 10, maxCandidates: 3000 }, { id: "m2", slug: "marketing", name: "Маркетинг", maxVacancies: null, maxCandidates: null }] },
            { id: "default-corp", slug: "corporation", name: "Корпорация", price: 1990000, currency: "RUB", interval: "month", sortOrder: 2, modules: [{ id: "m1", slug: "hr", name: "HR и найм", maxVacancies: null, maxCandidates: null }, { id: "m2", slug: "marketing", name: "Маркетинг", maxVacancies: null, maxCandidates: null }, { id: "m3", slug: "sales", name: "CRM", maxVacancies: null, maxCandidates: null }] },
          ] as Plan[])
        }
      })
      .catch(() => {
        setAllPlans([
          { id: "default-starter", slug: "starter", name: "Стартер", price: 490000, currency: "RUB", interval: "month", sortOrder: 0, modules: [{ id: "m1", slug: "hr", name: "HR и найм", maxVacancies: 3, maxCandidates: 500 }] },
          { id: "default-business", slug: "business", name: "Бизнес", price: 990000, currency: "RUB", interval: "month", sortOrder: 1, modules: [{ id: "m1", slug: "hr", name: "HR и найм", maxVacancies: 10, maxCandidates: 3000 }, { id: "m2", slug: "marketing", name: "Маркетинг", maxVacancies: null, maxCandidates: null }] },
          { id: "default-corp", slug: "corporation", name: "Корпорация", price: 1990000, currency: "RUB", interval: "month", sortOrder: 2, modules: [{ id: "m1", slug: "hr", name: "HR и найм", maxVacancies: null, maxCandidates: null }, { id: "m2", slug: "marketing", name: "Маркетинг", maxVacancies: null, maxCandidates: null }, { id: "m3", slug: "sales", name: "CRM", maxVacancies: null, maxCandidates: null }] },
        ] as Plan[])
      })
      .finally(() => setLoadingPlans(false))

    fetch("/api/billing/invoices")
      .then(r => r.json())
      .then((data: Invoice[]) => setInvoices(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingInvoices(false))
  }, [])

  async function handleChangePlan() {
    if (!confirmPlan) return
    setChangingPlan(true)
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: confirmPlan.id }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? "Ошибка смены тарифа")
        return
      }
      const invRes = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: confirmPlan.id }),
      })
      const newInvoice = invRes.ok ? await invRes.json() : null

      const [subData, invData] = await Promise.all([
        fetch("/api/billing/subscription").then(r => r.json()),
        fetch("/api/billing/invoices").then(r => r.json()),
      ])
      setSubscription(subData)
      setInvoices(Array.isArray(invData) ? invData : [])

      toast.success(`Тариф «${confirmPlan.name}» активирован${newInvoice ? `. Счёт ${newInvoice.invoiceNumber} создан` : ""}`)
      setConfirmPlan(null)
    } catch {
      toast.error("Ошибка при смене тарифа")
    } finally {
      setChangingPlan(false)
    }
  }

  async function handleCreateInvoice() {
    if (!invoicePlanId) { toast.error("Выберите тариф"); return }
    setCreatingInvoice(true)
    try {
      const res = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: invoicePlanId, period: invoicePeriod }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? "Ошибка создания счёта")
        return
      }
      const newInvoice = await res.json()
      setInvoices(prev => [newInvoice, ...prev])
      setInvoiceDialogOpen(false)
      toast.success(`Счёт ${newInvoice.invoiceNumber} сформирован`)
    } catch {
      toast.error("Ошибка при создании счёта")
    } finally {
      setCreatingInvoice(false)
    }
  }

  const currentPlanId = subscription?.plan?.id
  const currentPlan = allPlans.find(p => p.id === currentPlanId)

  // Selected plan for invoice
  const selectedInvoicePlan = allPlans.find(p => p.id === invoicePlanId)
  const periodMultiplier = PERIOD_OPTIONS.find(p => p.value === invoicePeriod)?.multiplier ?? 1
  const invoiceTotal = selectedInvoicePlan ? selectedInvoicePlan.price * periodMultiplier : 0

  return (
    <div className="py-6 pl-14 pr-14 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Тариф и оплата</h1>
        <p className="text-sm text-muted-foreground mt-1">Управление подпиской и счетами</p>
      </div>

      {/* Trial banner */}
      {subscription?.status === "trial" && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              <strong>Пробный период:</strong>{" "}
              {subscription.daysRemaining != null
                ? `осталось ${subscription.daysRemaining} ${pluralDays(subscription.daysRemaining)}`
                : subscription.trialEndsAt
                  ? `до ${formatDate(subscription.trialEndsAt)}`
                  : "активен"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0"
              onClick={() => document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" })}
            >
              Выбрать тариф
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Expired banner */}
      {subscription?.status === "expired" && (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>Пробный период завершён. Выберите тариф для продолжения.</span>
            <Button
              size="sm"
              variant="outline"
              className="border-red-400 text-red-700 hover:bg-red-100 shrink-0"
              onClick={() => document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" })}
            >
              Выбрать тариф
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ═══ Текущий тариф ═══ */}
      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Текущий тариф</h2>
        </div>

        {loadingSub ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {subscription?.plan?.name ?? "Пробный период"}
                </p>
                {subscription?.plan ? (
                  <p className="text-sm text-muted-foreground">
                    {formatKopecks(subscription.plan.price)} / месяц
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {subscription?.daysRemaining != null
                      ? `Осталось: ${subscription.daysRemaining} ${pluralDays(subscription.daysRemaining)}`
                      : "Выберите тариф для продолжения"}
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className={cn("text-xs", statusBadgeClass(subscription?.status ?? "trial"))}
              >
                {STATUS_LABELS[subscription?.status ?? "trial"] ?? subscription?.status ?? "Пробный"}
              </Badge>
              {subscription?.status === "trial" && subscription.trialEndsAt && (
                <span className="text-xs text-muted-foreground">
                  Пробный до {formatDate(subscription.trialEndsAt)}
                </span>
              )}
            </div>

            {/* Модули тарифа */}
            {currentPlan && currentPlan.modules.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Подключённые модули</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {currentPlan.modules.map(mod => (
                    <div key={mod.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-foreground">{mod.name}</span>
                      {(mod.maxVacancies != null || mod.maxCandidates != null) && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {mod.maxVacancies != null && `${mod.maxVacancies} вак.`}
                          {mod.maxVacancies != null && mod.maxCandidates != null && " / "}
                          {mod.maxCandidates != null && `${mod.maxCandidates.toLocaleString("ru-RU")} канд.`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!subscription?.plan && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                Выбрать тариф
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ═══ Тарифные планы ═══ */}
      <div id="plans-section" className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Тарифные планы</h2>
        {loadingPlans ? (
          <p className="text-sm text-muted-foreground">Загрузка тарифов...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {allPlans.map(plan => {
              const isCurrent = plan.id === currentPlanId
              const isArchived = plan.isArchived
              const hrModule = plan.modules.find(m => m.slug === "hr")

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-xl border border-border p-5 flex flex-col gap-3",
                    isCurrent && "border-primary ring-1 ring-primary",
                    isArchived && "opacity-70"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground text-sm">{plan.name}</h3>
                    <div className="flex flex-col gap-1 items-end">
                      {isCurrent && (
                        <Badge className="text-[10px] bg-primary text-primary-foreground px-1.5">
                          Текущий
                        </Badge>
                      )}
                      {isArchived && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 px-1.5">
                          Устаревший
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xl font-bold text-foreground">
                    {formatKopecks(plan.price)}
                    <span className="text-xs font-normal text-muted-foreground"> / мес</span>
                  </p>

                  <ul className="space-y-1.5 text-xs text-muted-foreground flex-1">
                    {plan.modules.map(mod => (
                      <li key={mod.id} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        {mod.name}
                      </li>
                    ))}
                    {hrModule && (
                      <>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          {hrModule.maxVacancies != null ? `${hrModule.maxVacancies} вакансий` : "Безлимит вакансий"}
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          {hrModule.maxCandidates != null
                            ? `${hrModule.maxCandidates.toLocaleString("ru-RU")} кандидатов`
                            : "Безлимит кандидатов"}
                        </li>
                      </>
                    )}
                  </ul>

                  <Button
                    size="sm"
                    variant={isCurrent ? "outline" : "default"}
                    className="w-full mt-auto"
                    disabled={isCurrent || isArchived}
                    onClick={() => !isCurrent && !isArchived && setConfirmPlan(plan)}
                  >
                    {isCurrent ? "Текущий" : isArchived ? "Недоступен" : "Перейти"}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══ Счета ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Счета</h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              setInvoicePlanId(currentPlanId ?? "")
              setInvoicePeriod("month")
              setInvoiceDialogOpen(true)
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Сформировать счёт
          </Button>
        </div>

        {loadingInvoices ? (
          <p className="text-sm text-muted-foreground">Загрузка счетов...</p>
        ) : invoices.length === 0 ? (
          <div className="rounded-xl border border-border p-5 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Нет выставленных счетов</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-2.5">Номер</th>
                  <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-2.5">Дата</th>
                  <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-2.5">Период</th>
                  <th className="text-right uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-2.5">Сумма</th>
                  <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-2.5">Статус</th>
                  <th className="w-[50px] px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-sm">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(inv.issuedAt ?? inv.createdAt)}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                      {inv.periodStart && inv.periodEnd
                        ? `${formatDate(inv.periodStart)} — ${formatDate(inv.periodEnd)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-medium">{formatKopecks(inv.amountKopecks)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className={cn("text-xs", invoiceStatusClass(inv.status))}>
                        {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Скачать счёт" asChild>
                        <a href={`/api/billing/invoices/${inv.id}/pdf`} download>
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Модалка: сформировать счёт ═══ */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Сформировать счёт
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Тариф</Label>
              <Select value={invoicePlanId} onValueChange={setInvoicePlanId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Выберите тариф" />
                </SelectTrigger>
                <SelectContent>
                  {allPlans.filter(p => !p.isArchived).map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} — {formatKopecks(plan.price)}/мес
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Период</Label>
              <Select value={invoicePeriod} onValueChange={setInvoicePeriod}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedInvoicePlan && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Тариф:</span>
                  <span className="font-medium">{selectedInvoicePlan.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Период:</span>
                  <span className="font-medium">{PERIOD_OPTIONS.find(p => p.value === invoicePeriod)?.label}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t mt-1">
                  <span className="font-medium">Итого:</span>
                  <span className="font-bold text-foreground">{formatKopecks(invoiceTotal)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)} disabled={creatingInvoice}>
              Отмена
            </Button>
            <Button onClick={handleCreateInvoice} disabled={creatingInvoice || !invoicePlanId} className="gap-1.5">
              {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {creatingInvoice ? "Формируем..." : "Сформировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Модалка: смена тарифа ═══ */}
      <Dialog open={!!confirmPlan} onOpenChange={open => !open && setConfirmPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Сменить тариф</DialogTitle>
          </DialogHeader>
          {confirmPlan && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Вы переходите на тариф{" "}
                <span className="font-semibold text-foreground">«{confirmPlan.name}»</span>{" "}
                за{" "}
                <span className="font-semibold text-foreground">
                  {formatKopecks(confirmPlan.price)} / месяц
                </span>
                .
              </p>
              <p className="text-sm text-muted-foreground">
                Будет автоматически создан счёт на оплату.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPlan(null)} disabled={changingPlan}>
              Отмена
            </Button>
            <Button onClick={handleChangePlan} disabled={changingPlan}>
              {changingPlan ? "Обработка..." : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function pluralDays(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 19) return "дней"
  switch (n % 10) {
    case 1: return "день"
    case 2:
    case 3:
    case 4: return "дня"
    default: return "дней"
  }
}
