"use client"

import { useState, useEffect, use } from "react"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { toast } from "sonner"
import { Handshake, ArrowLeft, Users, Wallet, Plus, Loader2, Unlink, Check } from "lucide-react"
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
  status: string | null
  referredAt: string | null
}

interface CompanyOption {
  id: string
  name: string
}

const LINK_STATUS: Record<string, { label: string; color: string }> = {
  active:      { label: "Активна",   color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  onboarding:  { label: "Онбординг", color: "bg-blue-100 text-blue-700 border-blue-200" },
  cancelled:   { label: "Отменена",  color: "bg-muted text-muted-foreground border-border" },
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

  // Добавление клиента
  const [addOpen, setAddOpen] = useState(false)
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)

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

  // Список компаний для селекта (грузим при первом открытии диалога).
  const openAddDialog = () => {
    setSelectedCompanyId(null)
    setAddOpen(true)
    if (companyOptions.length === 0) {
      fetch("/api/admin/users?companiesList=true")
        .then(r => r.ok ? r.json() : null)
        .then(b => { if (b?.companies) setCompanyOptions(b.companies) })
        .catch(() => toast.error("Не удалось загрузить компании"))
    }
  }

  // Привязать выбранную компанию (reassign — при 409 переспрашиваем).
  const linkCompany = async (reassign = false) => {
    if (!selectedCompanyId) { toast.error("Выберите компанию"); return }
    setLinking(true)
    try {
      const res = await fetch(`/api/admin/integrators/${id}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientCompanyId: selectedCompanyId, reassign }),
      })
      if (res.status === 409 && !reassign) {
        if (window.confirm("Компания уже привязана к другому партнёру. Перепривязать к этому?")) {
          setLinking(false)
          await linkCompany(true)
          return
        }
        return
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось привязать")
        return
      }
      // Перезагружаем список клиентов.
      const data = await fetch(`/api/admin/integrators/${id}/clients`).then(r => r.json())
      setClients(data.clients ?? [])
      setAddOpen(false)
      setSelectedCompanyId(null)
      toast.success("Клиент привязан")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setLinking(false)
    }
  }

  // Отвязать клиента (status='cancelled').
  const unlinkClient = async (linkId: string) => {
    if (!window.confirm("Отвязать клиента от партнёра? Связь будет отменена.")) return
    setUnlinkingId(linkId)
    try {
      const res = await fetch(`/api/admin/integrators/${id}/clients/${linkId}`, { method: "DELETE" })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось отвязать")
        return
      }
      setClients(prev => prev.map(c => c.id === linkId ? { ...c, status: "cancelled" } : c))
      toast.success("Клиент отвязан")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setUnlinkingId(null)
    }
  }

  // Компании, уже привязанные активно — прячем из списка выбора.
  const activeClientCompanyIds = new Set(
    clients.filter(c => c.status === "active").map(c => c.clientCompanyId)
  )
  const availableCompanies = companyOptions.filter(c => !activeClientCompanyIds.has(c.id))

  if (loading) {
    return (
      <AdminPageLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </AdminPageLayout>
    )
  }

  return (
    <AdminPageLayout>
          <div className="py-6 px-8">
            {/* Заголовок */}
            <div className="flex items-center gap-3 mb-6">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push("/admin/integrators")}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2 pt-3 pb-2">
                  <Users className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold">
                    {integrator?.companyName || "Партнёр"}
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
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5" onClick={openAddDialog}>
                    <Plus className="w-3.5 h-3.5" /> Добавить клиента
                  </Button>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" /> Клиенты партнёра
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {clients.length === 0 ? (
                      <p className="text-center py-10 text-sm text-muted-foreground">Нет привязанных клиентов</p>
                    ) : (
                      <DataTable>
                        <DataHead>
                          <DataHeadCell>Компания</DataHeadCell>
                          <DataHeadCell>ID компании</DataHeadCell>
                          <DataHeadCell align="center">Статус связи</DataHeadCell>
                          <DataHeadCell>Дата привязки</DataHeadCell>
                          <DataHeadCell align="right">Действия</DataHeadCell>
                        </DataHead>
                        <tbody>
                          {clients.map(c => {
                            const st = LINK_STATUS[c.status ?? "active"] ?? LINK_STATUS.active
                            const isCancelled = c.status === "cancelled"
                            return (
                              <DataRow key={c.id} className={cn(isCancelled && "opacity-60")}>
                                <DataCell className="font-medium">{c.companyName || "—"}</DataCell>
                                <DataCell className="text-xs text-muted-foreground font-mono">{c.clientCompanyId}</DataCell>
                                <DataCell align="center">
                                  <Badge className={cn("text-xs border", st.color)}>{st.label}</Badge>
                                </DataCell>
                                <DataCell className="text-xs text-muted-foreground">
                                  {c.referredAt ? new Date(c.referredAt).toLocaleDateString("ru-RU") : "—"}
                                </DataCell>
                                <DataCell align="right">
                                  {!isCancelled && (
                                    <Button
                                      size="sm" variant="ghost"
                                      className="h-8 gap-1.5 text-destructive hover:text-destructive"
                                      disabled={unlinkingId === c.id}
                                      onClick={() => unlinkClient(c.id)}
                                    >
                                      {unlinkingId === c.id
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Unlink className="w-3.5 h-3.5" />}
                                      Отвязать
                                    </Button>
                                  )}
                                </DataCell>
                              </DataRow>
                            )
                          })}
                        </tbody>
                      </DataTable>
                    )}
                  </CardContent>
                </Card>
              </div>
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
                      <DataTable>
                        <DataHead>
                          <DataHeadCell>Период</DataHeadCell>
                          <DataHeadCell align="right">MRR</DataHeadCell>
                          <DataHeadCell align="right">%</DataHeadCell>
                          <DataHeadCell align="right">Выплата</DataHeadCell>
                          <DataHeadCell align="center">Статус</DataHeadCell>
                        </DataHead>
                        <tbody>
                          {payouts.map(p => {
                            const st = PAYOUT_STATUS[p.status ?? "pending"] ?? PAYOUT_STATUS.pending
                            return (
                              <DataRow key={p.id}>
                                <DataCell className="text-xs text-muted-foreground">
                                  {new Date(p.periodStart).toLocaleDateString("ru-RU")} — {new Date(p.periodEnd).toLocaleDateString("ru-RU")}
                                </DataCell>
                                <DataCell align="right">
                                  {((p.totalMrrKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                                </DataCell>
                                <DataCell align="right" className="text-muted-foreground">{p.commissionPercent}%</DataCell>
                                <DataCell align="right" className="font-semibold text-emerald-600">
                                  {((p.payoutKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                                </DataCell>
                                <DataCell align="center">
                                  <Badge className={cn("text-xs", st.color)}>{st.label}</Badge>
                                </DataCell>
                              </DataRow>
                            )
                          })}
                        </tbody>
                      </DataTable>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

      {/* Sheet новой выплаты */}
      <Sheet open={payoutSheetOpen} onOpenChange={setPayoutSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Новая выплата</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-4">
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
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Диалог: добавить клиента */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить клиента</DialogTitle>
            <DialogDescription>
              Выберите компанию, чтобы привязать её к этому партнёру.
            </DialogDescription>
          </DialogHeader>
          <Command className="rounded-lg border">
            <CommandInput placeholder="Поиск компании по названию..." />
            <CommandList>
              <CommandEmpty>Компании не найдены</CommandEmpty>
              <CommandGroup>
                {availableCompanies.map(c => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => setSelectedCompanyId(c.id)}
                    className="cursor-pointer"
                  >
                    <Check className={cn("mr-2 h-4 w-4", selectedCompanyId === c.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{c.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} disabled={linking}>
              Отмена
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => linkCompany(false)} disabled={linking || !selectedCompanyId}>
              {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Привязать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  )
}
