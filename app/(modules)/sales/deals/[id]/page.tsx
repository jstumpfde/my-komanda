"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Handshake, ArrowLeft, Building2, User, UserCircle,
  Calendar, Trash2, Save, Clock,
} from "lucide-react"
import { toast } from "sonner"
import { DEAL_STAGES, DEAL_PRIORITIES, DEAL_SOURCES, type DealStageId } from "@/lib/crm/deal-stages"
import { cn } from "@/lib/utils"

// ─── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_DEALS: Record<string, {
  id: string; title: string; amount: number | null; currency: string
  stage: string; priority: string; probability: number | null
  companyId: string | null; companyName: string | null
  contactId: string | null; contactName: string | null
  assignedToId: string | null; assignedToName: string | null
  description: string | null; source: string | null
  expectedCloseDate: string | null; closedAt: string | null
  createdAt: string; updatedAt: string
}> = {
  "1": { id: "1", title: "Поставка серверов для Ромашка", amount: 250000000, currency: "RUB", stage: "new", priority: "high", probability: 10, companyId: "1", companyName: 'ООО "Ромашка"', contactId: "1", contactName: "Иван Петров", assignedToId: null, assignedToName: "Алексей Иванов", description: "Поставка 10 серверов Dell PowerEdge для нового дата-центра клиента.", source: "Сайт", expectedCloseDate: "2026-05-15", closedAt: null, createdAt: "2026-04-01T10:00:00Z", updatedAt: "2026-04-10T14:30:00Z" },
  "2": { id: "2", title: "Внедрение CRM Альфа Групп", amount: 500000000, currency: "RUB", stage: "qualifying", priority: "high", probability: 20, companyId: "2", companyName: 'ЗАО "Альфа Групп"', contactId: "4", contactName: "Елена Волкова", assignedToId: null, assignedToName: "Мария Петрова", description: null, source: "Реферал", expectedCloseDate: "2026-06-01", closedAt: null, createdAt: "2026-03-20T09:00:00Z", updatedAt: "2026-04-05T11:00:00Z" },
  "3": { id: "3", title: "Обучение сотрудников ТехноПлюс", amount: 80000000, currency: "RUB", stage: "proposal", priority: "medium", probability: 40, companyId: "4", companyName: 'ООО "ТехноПлюс"', contactId: "7", contactName: "Ольга Смирнова", assignedToId: null, assignedToName: null, description: "Программа обучения 50 сотрудников по работе с новой ERP.", source: "Звонок", expectedCloseDate: "2026-05-20", closedAt: null, createdAt: "2026-03-15T08:00:00Z", updatedAt: "2026-04-03T16:00:00Z" },
  "4": { id: "4", title: "Аутсорс поддержки ИП Петров", amount: 35000000, currency: "RUB", stage: "negotiation", priority: "low", probability: 60, companyId: "3", companyName: "ИП Петров", contactId: "6", contactName: "Сергей Петров", assignedToId: null, assignedToName: "Дмитрий Козлов", description: null, source: "Email", expectedCloseDate: "2026-04-30", closedAt: null, createdAt: "2026-03-10T12:00:00Z", updatedAt: "2026-04-08T10:00:00Z" },
  "5": { id: "5", title: "Лицензии 1С для СтройМастер", amount: 120000000, currency: "RUB", stage: "won", priority: "medium", probability: 100, companyId: "5", companyName: 'ООО "СтройМастер"', contactId: null, contactName: null, assignedToId: null, assignedToName: "Алексей Иванов", description: "50 лицензий 1С:Предприятие 8.3 ПРОФ.", source: "Выставка", expectedCloseDate: "2026-04-10", closedAt: "2026-04-10T18:00:00Z", createdAt: "2026-02-20T09:00:00Z", updatedAt: "2026-04-10T18:00:00Z" },
  "6": { id: "6", title: "Консалтинг ИП Петров", amount: 15000000, currency: "RUB", stage: "lost", priority: "low", probability: 0, companyId: "3", companyName: "ИП Петров", contactId: "6", contactName: "Сергей Петров", assignedToId: null, assignedToName: "Сергей Новиков", description: null, source: "Звонок", expectedCloseDate: "2026-03-15", closedAt: "2026-03-20T15:00:00Z", createdAt: "2026-02-01T10:00:00Z", updatedAt: "2026-03-20T15:00:00Z" },
  "7": { id: "7", title: "Интеграция API Альфа Групп", amount: 320000000, currency: "RUB", stage: "new", priority: "medium", probability: 10, companyId: "2", companyName: 'ЗАО "Альфа Групп"', contactId: "5", contactName: "Дмитрий Новиков", assignedToId: null, assignedToName: null, description: null, source: "Реферал", expectedCloseDate: "2026-07-01", closedAt: null, createdAt: "2026-04-10T11:00:00Z", updatedAt: "2026-04-10T11:00:00Z" },
  "8": { id: "8", title: "Настройка телефонии ГК Вектор", amount: 45000000, currency: "RUB", stage: "qualifying", priority: "medium", probability: 20, companyId: null, companyName: "ГК Вектор", contactId: null, contactName: null, assignedToId: null, assignedToName: "Мария Петрова", description: null, source: "Звонок", expectedCloseDate: "2026-05-30", closedAt: null, createdAt: "2026-04-05T14:00:00Z", updatedAt: "2026-04-05T14:00:00Z" },
}

function formatAmount(amount: number | null) {
  if (!amount) return "—"
  return new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 0,
  }).format(amount / 100)
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

function formatDateInput(d: string | null) {
  if (!d) return ""
  return d.slice(0, 10)
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const initial = MOCK_DEALS[id]

  const [deal, setDeal] = useState(initial || null)

  if (!deal) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Сделка не найдена</p>
              <Button variant="outline" onClick={() => router.push("/sales/deals")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                К воронке
              </Button>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const update = (patch: Partial<typeof deal>) => setDeal((prev) => prev ? { ...prev, ...patch } : prev)

  const handleStageClick = (stageId: string) => {
    const stageInfo = DEAL_STAGES.find((s) => s.id === stageId)
    update({
      stage: stageId,
      probability: stageInfo?.probability ?? deal.probability,
      closedAt: stageId === "won" || stageId === "lost" ? new Date().toISOString() : deal.closedAt,
    })
    toast.success(`Этап: ${stageInfo?.label}`)
  }

  const handleSave = () => {
    toast.success("Сделка сохранена")
  }

  const handleDelete = () => {
    toast.success("Сделка удалена")
    router.push("/sales/deals")
  }

  const currentStageIdx = DEAL_STAGES.findIndex((s) => s.id === deal.stage)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.push("/sales/deals")}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Handshake className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-semibold">Сделка</h1>
              </div>
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive gap-1.5">
                      <Trash2 className="w-4 h-4" />
                      Удалить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить сделку?</AlertDialogTitle>
                      <AlertDialogDescription>Это действие необратимо. Сделка будет удалена навсегда.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button size="sm" className="gap-1.5" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                  Сохранить
                </Button>
              </div>
            </div>

            {/* Stage progress bar */}
            <div className="mb-6">
              <div className="flex gap-1">
                {DEAL_STAGES.map((stage, idx) => {
                  const isActive = deal.stage === stage.id
                  const isPast = idx < currentStageIdx && deal.stage !== "lost"
                  return (
                    <button
                      key={stage.id}
                      onClick={() => handleStageClick(stage.id)}
                      className={cn(
                        "flex-1 py-2 px-3 text-xs font-medium rounded-md transition-all text-center",
                        "hover:opacity-80 cursor-pointer",
                        isActive && "text-white shadow-sm",
                        isPast && "text-white/90",
                        !isActive && !isPast && "bg-muted text-muted-foreground",
                      )}
                      style={{
                        backgroundColor: isActive || isPast ? stage.color : undefined,
                        opacity: isPast && !isActive ? 0.6 : 1,
                      }}
                    >
                      {stage.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Left (2/3) — основная информация */}
              <div className="col-span-2 space-y-6">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <Label>Название</Label>
                      <Input
                        value={deal.title}
                        onChange={(e) => update({ title: e.target.value })}
                        className="text-lg font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label>Сумма</Label>
                        <Input
                          value={deal.amount ? String(deal.amount / 100) : ""}
                          onChange={(e) => update({ amount: e.target.value ? Number(e.target.value) * 100 : null })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Валюта</Label>
                        <Select value={deal.currency} onValueChange={(v) => update({ currency: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RUB">RUB</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Вероятность (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={deal.probability ?? ""}
                          onChange={(e) => update({ probability: e.target.value ? Number(e.target.value) : null })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Приоритет</Label>
                        <Select value={deal.priority} onValueChange={(v) => update({ priority: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DEAL_PRIORITIES.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Источник</Label>
                        <Select value={deal.source || ""} onValueChange={(v) => update({ source: v })}>
                          <SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger>
                          <SelectContent>
                            {DEAL_SOURCES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Ожидаемая дата закрытия</Label>
                      <Input
                        type="date"
                        value={formatDateInput(deal.expectedCloseDate)}
                        onChange={(e) => update({ expectedCloseDate: e.target.value || null })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Описание</Label>
                      <Textarea
                        placeholder="Заметки по сделке..."
                        value={deal.description || ""}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right (1/3) — связи и мета */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Компания
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {deal.companyName ? (
                      <p className="text-sm font-medium">{deal.companyName}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Не привязана</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Контакт
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {deal.contactName ? (
                      <p className="text-sm font-medium">{deal.contactName}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Не привязан</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <UserCircle className="w-4 h-4" />
                      Ответственный
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {deal.assignedToName ? (
                      <p className="text-sm font-medium">{deal.assignedToName}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Не назначен</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Даты
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Создана</span>
                      <span>{formatDate(deal.createdAt)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Обновлена</span>
                      <span>{formatDate(deal.updatedAt)}</span>
                    </div>
                    {deal.closedAt && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Закрыта</span>
                        <span>{formatDate(deal.closedAt)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Сумма</span>
                      <span className="text-lg font-bold">{formatAmount(deal.amount)}</span>
                    </div>
                    {deal.stage !== "won" && deal.stage !== "lost" && deal.probability != null && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Взвешенная</span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {formatAmount(deal.amount && deal.probability ? Math.round(deal.amount * deal.probability / 100) : null)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
