"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Handshake, Plus, Search, GripVertical,
  TrendingUp, DollarSign, Trophy, Percent, Circle,
} from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { DEAL_STAGES, DEAL_PRIORITIES } from "@/lib/crm/deal-stages"
import { DealCreateModal } from "@/components/sales/deal-create-modal"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DealItem {
  id: string
  title: string
  amount: number | null
  currency: string
  stage: string
  priority: string
  probability: number | null
  companyId: string | null
  contactId: string | null
  assignedToId: string | null
  description: string | null
  source: string | null
  expectedCloseDate: string | null
  closedAt: string | null
  createdAt: string
  companyName: string | null
  contactFirstName: string | null
  contactLastName: string | null
  assignedToName: string | null
  assignedToAvatar: string | null
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_DEALS: DealItem[] = [
  { id: "1", title: "Поставка серверов для Ромашка", amount: 250000000, currency: "RUB", stage: "new", priority: "high", probability: 10, companyId: "1", contactId: "1", assignedToId: null, description: null, source: "Сайт", expectedCloseDate: "2026-05-15", closedAt: null, createdAt: "2026-04-01", companyName: 'ООО "Ромашка"', contactFirstName: "Иван", contactLastName: "Петров", assignedToName: "Алексей Иванов", assignedToAvatar: null },
  { id: "2", title: "Внедрение CRM Альфа Групп", amount: 500000000, currency: "RUB", stage: "qualifying", priority: "high", probability: 20, companyId: "2", contactId: "4", assignedToId: null, description: null, source: "Реферал", expectedCloseDate: "2026-06-01", closedAt: null, createdAt: "2026-03-20", companyName: 'ЗАО "Альфа Групп"', contactFirstName: "Елена", contactLastName: "Волкова", assignedToName: "Мария Петрова", assignedToAvatar: null },
  { id: "3", title: "Обучение сотрудников ТехноПлюс", amount: 80000000, currency: "RUB", stage: "proposal", priority: "medium", probability: 40, companyId: "4", contactId: "7", assignedToId: null, description: null, source: "Звонок", expectedCloseDate: "2026-05-20", closedAt: null, createdAt: "2026-03-15", companyName: 'ООО "ТехноПлюс"', contactFirstName: "Ольга", contactLastName: "Смирнова", assignedToName: null, assignedToAvatar: null },
  { id: "4", title: "Аутсорс поддержки ИП Петров", amount: 35000000, currency: "RUB", stage: "negotiation", priority: "low", probability: 60, companyId: "3", contactId: "6", assignedToId: null, description: null, source: "Email", expectedCloseDate: "2026-04-30", closedAt: null, createdAt: "2026-03-10", companyName: "ИП Петров", contactFirstName: "Сергей", contactLastName: "Петров", assignedToName: "Дмитрий Козлов", assignedToAvatar: null },
  { id: "5", title: "Лицензии 1С для СтройМастер", amount: 120000000, currency: "RUB", stage: "won", priority: "medium", probability: 100, companyId: "5", contactId: null, assignedToId: null, description: null, source: "Выставка", expectedCloseDate: "2026-04-10", closedAt: "2026-04-10", createdAt: "2026-02-20", companyName: 'ООО "СтройМастер"', contactFirstName: null, contactLastName: null, assignedToName: "Алексей Иванов", assignedToAvatar: null },
  { id: "6", title: "Консалтинг ИП Петров", amount: 15000000, currency: "RUB", stage: "lost", priority: "low", probability: 0, companyId: "3", contactId: "6", assignedToId: null, description: null, source: "Звонок", expectedCloseDate: "2026-03-15", closedAt: "2026-03-20", createdAt: "2026-02-01", companyName: "ИП Петров", contactFirstName: "Сергей", contactLastName: "Петров", assignedToName: "Сергей Новиков", assignedToAvatar: null },
  { id: "7", title: "Интеграция API Альфа Групп", amount: 320000000, currency: "RUB", stage: "new", priority: "medium", probability: 10, companyId: "2", contactId: "5", assignedToId: null, description: null, source: "Реферал", expectedCloseDate: "2026-07-01", closedAt: null, createdAt: "2026-04-10", companyName: 'ЗАО "Альфа Групп"', contactFirstName: "Дмитрий", contactLastName: "Новиков", assignedToName: null, assignedToAvatar: null },
  { id: "8", title: "Настройка телефонии ГК Вектор", amount: 45000000, currency: "RUB", stage: "qualifying", priority: "medium", probability: 20, companyId: null, contactId: null, assignedToId: null, description: null, source: "Звонок", expectedCloseDate: "2026-05-30", closedAt: null, createdAt: "2026-04-05", companyName: "ГК Вектор", contactFirstName: null, contactLastName: null, assignedToName: "Мария Петрова", assignedToAvatar: null },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number | null, currency?: string) {
  if (!amount) return "—"
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency || "RUB",
    maximumFractionDigits: 0,
  }).format(amount / 100)
}

function formatShort(amount: number) {
  if (amount >= 100_000_00) return `${(amount / 100_000_00).toFixed(1).replace(/\.0$/, "")} млн ₽`
  if (amount >= 1_000_00) return `${Math.round(amount / 1_000_00)} тыс ₽`
  return formatAmount(amount)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<DealItem[]>(MOCK_DEALS)
  const [search, setSearch] = useState("")
  const [filterPriority, setFilterPriority] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)
  const [dragDealId, setDragDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  // фильтрация
  const filtered = deals.filter((d) => {
    if (search) {
      const q = search.toLowerCase()
      if (!d.title.toLowerCase().includes(q) && !(d.companyName || "").toLowerCase().includes(q)) return false
    }
    if (filterPriority !== "all" && d.priority !== filterPriority) return false
    return true
  })

  // группировка по stage
  const grouped: Record<string, DealItem[]> = {}
  for (const s of DEAL_STAGES) grouped[s.id] = []
  for (const d of filtered) {
    const key = d.stage || "new"
    if (grouped[key]) grouped[key].push(d)
  }

  // summary
  const totalDeals = deals.length
  const activeAmount = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((s, d) => s + (d.amount || 0), 0)
  const wonDeals = deals.filter((d) => d.stage === "won")
  const wonAmount = wonDeals.reduce((s, d) => s + (d.amount || 0), 0)
  const lostCount = deals.filter((d) => d.stage === "lost").length
  const conversion = wonDeals.length + lostCount > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostCount)) * 100)
    : 0

  // ─── DnD ────────────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDragDealId(dealId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", dealId)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverStage(stageId)
  }

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOverStage(null)
    const dealId = e.dataTransfer.getData("text/plain")
    if (!dealId) return

    const stageInfo = DEAL_STAGES.find((s) => s.id === stageId)
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage: stageId,
              probability: stageInfo?.probability ?? d.probability,
              closedAt: stageId === "won" || stageId === "lost" ? new Date().toISOString() : d.closedAt,
            }
          : d,
      ),
    )
    setDragDealId(null)
    toast.success(`Сделка перемещена → ${stageInfo?.label}`)
  }

  const handleCreate = (data: Record<string, unknown>) => {
    const stageInfo = DEAL_STAGES.find((s) => s.id === ((data.stage as string) || "new"))
    const newDeal: DealItem = {
      id: String(Date.now()),
      title: data.title as string,
      amount: data.amount ? Number(data.amount) * 100 : null,
      currency: "RUB",
      stage: (data.stage as string) || "new",
      priority: "medium",
      probability: stageInfo?.probability ?? 10,
      companyId: null,
      contactId: null,
      assignedToId: null,
      description: null,
      source: (data.source as string) || null,
      expectedCloseDate: (data.expectedCloseDate as string) || null,
      closedAt: null,
      createdAt: new Date().toISOString(),
      companyName: null,
      contactFirstName: null,
      contactLastName: null,
      assignedToName: null,
      assignedToAvatar: null,
    }
    setDeals((prev) => [newDeal, ...prev])
    setModalOpen(false)
    toast.success("Сделка создана")
    router.push(`/sales/deals/${newDeal.id}`)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Handshake className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Сделки</h1>
                  <p className="text-sm text-muted-foreground">Воронка продаж</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Новая сделка
              </Button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Всего сделок</p>
                    <p className="text-2xl font-bold">{totalDeals}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">В работе</p>
                    <p className="text-2xl font-bold">{formatShort(activeAmount)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Выиграно</p>
                    <p className="text-2xl font-bold">{formatShort(wonAmount)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Percent className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Конверсия</p>
                    <p className="text-2xl font-bold">{conversion}%</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по названию, компании..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Приоритет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все приоритеты</SelectItem>
                  {DEAL_PRIORITIES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Kanban */}
            <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
              {DEAL_STAGES.map((stage) => {
                const cards = grouped[stage.id] || []
                const colAmount = cards.reduce((s, d) => s + (d.amount || 0), 0)
                const isOver = dragOverStage === stage.id

                return (
                  <div
                    key={stage.id}
                    className={`flex-shrink-0 w-[280px] rounded-xl border transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
                    onDragOver={(e) => handleDragOver(e, stage.id)}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => handleDrop(e, stage.id)}
                  >
                    {/* Column header */}
                    <div className="p-3 border-b border-border">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span className="font-medium text-sm">{stage.label}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
                      </div>
                      {colAmount > 0 && (
                        <p className="text-xs text-muted-foreground ml-5">{formatAmount(colAmount)}</p>
                      )}
                    </div>

                    {/* Cards */}
                    <div className="p-2 space-y-2 min-h-[100px]">
                      {cards.map((deal) => {
                        const pr = DEAL_PRIORITIES.find((p) => p.id === deal.priority)
                        return (
                          <div
                            key={deal.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, deal.id)}
                            onClick={() => router.push(`/sales/deals/${deal.id}`)}
                            className={`group cursor-pointer rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-all ${dragDealId === deal.id ? "opacity-40" : ""}`}
                          >
                            <div className="flex items-start justify-between mb-1.5">
                              <h3 className="text-sm font-medium leading-tight line-clamp-2 flex-1">{deal.title}</h3>
                              <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1" />
                            </div>
                            {deal.amount != null && (
                              <p className="text-sm font-semibold mb-2">{formatAmount(deal.amount, deal.currency)}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Circle className="w-2 h-2 fill-current" style={{ color: pr?.color }} />
                                {deal.companyName && <span className="truncate max-w-[130px]">{deal.companyName}</span>}
                              </div>
                              {deal.assignedToName && (
                                <Avatar className="w-5 h-5">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {deal.assignedToName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {cards.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-8">Нет сделок</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>

      <DealCreateModal open={modalOpen} onOpenChange={setModalOpen} onSubmit={handleCreate} />
    </SidebarProvider>
  )
}
