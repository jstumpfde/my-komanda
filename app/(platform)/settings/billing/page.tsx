"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  AlertTriangle, Clock, Download, CreditCard, CheckCircle2, XCircle,
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
  modules: {
    id: string
    slug: string
    name: string
    maxVacancies: number | null
    maxCandidates: number | null
  }[]
}

interface Invoice {
  id: string
  number: string
  amountKopecks: number
  status: string
  issuedAt: string | null
  paidAt: string | null
  dueDate: string | null
  planId: string | null
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
    case "issued":    return "bg-amber-500/10 text-amber-700 border-amber-200"
    case "draft":     return "bg-muted text-muted-foreground"
    case "cancelled": return "bg-red-500/10 text-red-700 border-red-200"
    default:          return "bg-muted text-muted-foreground"
  }
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [allPlans, setAllPlans] = useState<Plan[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingSub, setLoadingSub] = useState(true)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingInvoices, setLoadingInvoices] = useState(true)

  // Confirm dialog state
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null)
  const [changingPlan, setChangingPlan] = useState(false)

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then(r => r.json())
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoadingSub(false))

    fetch("/api/plans")
      .then(r => r.json())
      .then((data: Plan[]) => setAllPlans(data))
      .catch(() => {})
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
      // Change plan
      const res = await fetch("/api/billing/change-plan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId: confirmPlan.id }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? "Ошибка смены тарифа")
        return
      }
      // Create invoice
      const invRes = await fetch("/api/billing/invoices", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId: confirmPlan.id }),
      })
      const newInvoice = invRes.ok ? await invRes.json() : null

      // Refresh state
      const [subData, invData] = await Promise.all([
        fetch("/api/billing/subscription").then(r => r.json()),
        fetch("/api/billing/invoices").then(r => r.json()),
      ])
      setSubscription(subData)
      setInvoices(Array.isArray(invData) ? invData : [])

      toast.success(`Тариф «${confirmPlan.name}» активирован${newInvoice ? `. Счёт ${newInvoice.number} создан` : ""}`)
      setConfirmPlan(null)
    } catch {
      toast.error("Ошибка при смене тарифа")
    } finally {
      setChangingPlan(false)
    }
  }

  const currentPlanId = subscription?.plan?.id

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Тариф и оплата</h1>
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
              onClick={() => {
                const el = document.getElementById("plans-section")
                el?.scrollIntoView({ behavior: "smooth" })
              }}
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
              onClick={() => {
                const el = document.getElementById("plans-section")
                el?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              Выбрать тариф
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Current plan card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            Текущий тариф
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSub ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {subscription?.plan?.name ?? "Без тарифа"}
                </p>
                {subscription?.plan && (
                  <p className="text-sm text-muted-foreground">
                    {formatKopecks(subscription.plan.price)} / месяц
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className={cn("text-xs", statusBadgeClass(subscription?.status ?? ""))}
              >
                {STATUS_LABELS[subscription?.status ?? ""] ?? subscription?.status ?? "—"}
              </Badge>
              {subscription?.status === "trial" && subscription.trialEndsAt && (
                <span className="text-xs text-muted-foreground">
                  Пробный до {formatDate(subscription.trialEndsAt)}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison cards */}
      <div id="plans-section">
        <h2 className="text-base font-semibold text-foreground mb-3">Тарифные планы</h2>
        {loadingPlans ? (
          <p className="text-sm text-muted-foreground">Загрузка тарифов...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {allPlans.map(plan => {
              const isCurrent = plan.id === currentPlanId
              const isArchived = plan.isArchived

              // Find HR module limits
              const hrModule = plan.modules.find(m => m.slug === "hr")

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col",
                    isCurrent && "border-primary ring-1 ring-primary",
                    isArchived && "opacity-70"
                  )}
                >
                  <CardContent className="p-4 flex flex-col gap-3 flex-1">
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

                    {hrModule && (
                      <ul className="space-y-1 text-xs text-muted-foreground flex-1">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          {hrModule.maxVacancies != null ? `${hrModule.maxVacancies} вакансии` : "Безлимит вакансий"}
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          {hrModule.maxCandidates != null
                            ? `${hrModule.maxCandidates.toLocaleString("ru-RU")} кандидатов`
                            : "Безлимит кандидатов"}
                        </li>
                      </ul>
                    )}

                    <Button
                      size="sm"
                      variant={isCurrent ? "outline" : "default"}
                      className="w-full mt-auto"
                      disabled={isCurrent || isArchived}
                      onClick={() => !isCurrent && !isArchived && setConfirmPlan(plan)}
                    >
                      {isCurrent ? "Текущий" : isArchived ? "Недоступен" : "Выбрать"}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Invoices table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Счета</h2>
        {loadingInvoices ? (
          <p className="text-sm text-muted-foreground">Загрузка счетов...</p>
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Счетов пока нет</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Номер</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(inv.issuedAt)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatKopecks(inv.amountKopecks)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", invoiceStatusClass(inv.status))}>
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Скачать счёт"
                          asChild
                        >
                          <a href={`/api/billing/invoices/${inv.id}/pdf`} download>
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm change plan dialog */}
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
