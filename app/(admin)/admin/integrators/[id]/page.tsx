"use client"

import { useState, useEffect, use } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "sonner"
import { Handshake, ArrowLeft, Users, Wallet, Plus, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface Integrator {
  id: string
  companyName: string | null
  levelName: string | null
  status: string | null
  joinedAt: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  companyId: string
}

interface Client {
  id: string
  clientCompanyId: string
  companyName: string | null
  referredAt: string | null
}

interface Payout {
  id: string
  periodStart: string
  periodEnd: string
  totalMrrKopecks: number | null
  commissionPercent: string | null
  payoutKopecks: number | null
  status: string | null
  paidAt: string | null
}

const LEVEL_COLORS: Record<string, string> = {
  Bronze:   "bg-amber-100 text-amber-700 border-amber-200",
  Silver:   "bg-gray-100 text-gray-700 border-gray-200",
  Gold:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  Platinum: "bg-violet-100 text-violet-700 border-violet-200",
  VIP:      "bg-red-100 text-red-700 border-red-200",
}

const PAYOUT_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: "Ожидает", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Одобрено", color: "bg-blue-100 text-blue-700" },
  paid:     { label: "Выплачено", color: "bg-emerald-100 text-emerald-700" },
}

type Tab = "overview" | "clients" | "payouts"

export default function IntegratorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [integrator, setIntegrator] = useState<Integrator | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [tab, setTab] = useState<Tab>("overview")
  const [loading, setLoading] = useState(true)
  const [payoutSheetOpen, setPayoutSheetOpen] = useState(false)
  const [creatingPayout, setCreatingPayout] = useState(false)
  const [newPeriodStart, setNewPeriodStart] = useState("")
  const [newPeriodEnd, setNewPeriodEnd] = useState("")
  const [newTotalMrr, setNewTotalMrr] = useState("")
  const [newCommission, setNewCommission] = useState("10")

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/integrators/${id}`).then(r => r.json()),
      fetch(`/api/admin/integrators/${id}/clients`).then(r => r.json()),
      fetch(`/api/admin/integrators/${id}/payouts`).then(r => r.json()),
    ])
      .then(([intData, clientData, payoutData]) => {
        setIntegrator(intData.integrator ?? null)
        setClients(clientData.clients ?? [])
        setPayouts(payoutData.payouts ?? [])
      })
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false))
  }, [id])

  const handleCreatePayout = async () => {
    if (!newPeriodStart || !newPeriodEnd) { toast.error("Укажите период"); return }
    setCreatingPayout(true)
    try {
      const res = await fetch(`/api/admin/integrators/${id}/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart:       newPeriodStart,
          periodEnd:         newPeriodEnd,
          totalMrrKopecks:   Math.round(parseFloat(newTotalMrr || "0") * 100),
          commissionPercent: newCommission,
        }),
      })
      if (!res.ok) throw new Error()
      const { payout } = await res.json()
      setPayouts(prev => [payout, ...prev])
      setPayoutSheetOpen(false)
      toast.success("Выплата создана")
      setNewPeriodStart(""); setNewPeriodEnd(""); setNewTotalMrr(""); setNewCommission("10")
    } catch {
      toast.error("Ошибка при создании")
    } finally {
      setCreatingPayout(false)
    }
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Заголовок */}
            <div className="flex items-center gap-3 mb-6">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push("/admin/integrators")}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <Handshake className="w-5 h-5 text-primary" />
                  <h1 className="text-xl font-semibold text-foreground">
                    {integrator?.companyName || "Интегратор"}
                  </h1>
                  {integrator?.levelName && (
                    <Badge className={cn("text-xs border", LEVEL_COLORS[integrator.levelName] ?? "bg-muted")}>
                      {integrator.levelName}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">ID: {id}</p>
              </div>
            </div>

            {/* Табы */}
            <div className="flex gap-1 mb-4 border-b">
              {([
                { id: "overview" as Tab, label: "Обзор" },
                { id: "clients" as Tab, label: `Клиенты (${clients.length})` },
                { id: "payouts" as Tab, label: `Выплаты (${payouts.length})` },
              ] as { id: Tab; label: string }[]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                    tab === t.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Обзор */}
            {tab === "overview" && integrator && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Контакты и статус</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Контактное лицо</p>
                      <p className="font-medium">{integrator.contactName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                      <p className="font-medium">{integrator.contactEmail || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Телефон</p>
                      <p className="font-medium">{integrator.contactPhone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Статус</p>
                      <Badge className="text-xs">{integrator.status || "active"}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Уровень</p>
                      <p className="font-medium">{integrator.levelName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Дата вступления</p>
                      <p className="font-medium">
                        {integrator.joinedAt ? new Date(integrator.joinedAt).toLocaleDateString("ru-RU") : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Клиенты */}
            {tab === "clients" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" /> Клиенты интегратора
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {clients.length === 0 ? (
                    <p className="text-center py-10 text-sm text-muted-foreground">Нет привязанных клиентов</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Компания</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">ID компании</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата привязки</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map(c => (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="px-4 py-3 text-sm font-medium">{c.companyName || "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{c.clientCompanyId}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {c.referredAt ? new Date(c.referredAt).toLocaleDateString("ru-RU") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Выплаты */}
            {tab === "payouts" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5" onClick={() => setPayoutSheetOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Новая выплата
                  </Button>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="w-4 h-4" /> Выплаты
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {payouts.length === 0 ? (
                      <p className="text-center py-10 text-sm text-muted-foreground">Нет выплат</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Период</th>
                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">MRR</th>
                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">%</th>
                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Выплата</th>
                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payouts.map(p => {
                            const st = PAYOUT_STATUS[p.status ?? "pending"] ?? PAYOUT_STATUS.pending
                            return (
                              <tr key={p.id} className="border-b last:border-0">
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  {new Date(p.periodStart).toLocaleDateString("ru-RU")} — {new Date(p.periodEnd).toLocaleDateString("ru-RU")}
                                </td>
                                <td className="px-4 py-3 text-sm text-right">
                                  {((p.totalMrrKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground">{p.commissionPercent}%</td>
                                <td className="px-4 py-3 text-sm font-semibold text-right text-emerald-600">
                                  {((p.payoutKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Badge className={cn("text-xs", st.color)}>{st.label}</Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Sheet новой выплаты */}
      <Sheet open={payoutSheetOpen} onOpenChange={setPayoutSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Новая выплата</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label className="text-sm">Начало периода</Label>
              <Input type="date" value={newPeriodStart} onChange={e => setNewPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Конец периода</Label>
              <Input type="date" value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-sm">Суммарный MRR (₽)</Label>
              <Input type="number" value={newTotalMrr} onChange={e => setNewTotalMrr(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Комиссия (%)</Label>
              <Input type="number" value={newCommission} onChange={e => setNewCommission(e.target.value)} />
            </div>
            {newTotalMrr && newCommission && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200">
                <span className="text-sm text-muted-foreground">К выплате:</span>
                <span className="text-sm font-bold text-emerald-600">
                  {(parseFloat(newTotalMrr) * parseFloat(newCommission) / 100).toLocaleString("ru-RU")} ₽
                </span>
              </div>
            )}
            <Button className="w-full gap-1.5" onClick={handleCreatePayout} disabled={creatingPayout}>
              {creatingPayout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Создать выплату
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
