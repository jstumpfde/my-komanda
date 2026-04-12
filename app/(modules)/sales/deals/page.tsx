"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Handshake, Plus, Search, GripVertical,
  TrendingUp, DollarSign, Trophy, Percent,
  PackageOpen,
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

// ─── CountUp ──────────────────────────────────────────────────────────────────

function useCountUp(target: number | null, durationMs = 1000): number {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (target === null || target === undefined) return
    const start = display
    const delta = target - start
    if (delta === 0) return
    const startTime = performance.now()
    let rafId = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(start + delta * eased))
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])
  return display
}

function CountUp({ value }: { value: number | null }) {
  const d = useCountUp(value)
  if (value === null) return <>…</>
  return <>{d}</>
}

function CountUpAmount({ value }: { value: number | null }) {
  const d = useCountUp(value)
  if (value === null) return <>…</>
  if (d >= 100_000_00) return <>{(d / 100_000_00).toFixed(1).replace(/\.0$/, "")} млн ₽</>
  if (d >= 1_000_00) return <>{Math.round(d / 1_000_00)} тыс ₽</>
  return <>{new Intl.NumberFormat("ru-RU").format(d / 100)} ₽</>
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

const PRIORITY_BORDER: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#6B7280",
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

  const summaryCards = [
    { label: "Всего сделок", value: totalDeals, isAmount: false, bg: "bg-blue-500", Icon: TrendingUp },
    { label: "В работе", value: activeAmount, isAmount: true, bg: "bg-purple-500", Icon: DollarSign },
    { label: "Выиграно", value: wonAmount, isAmount: true, bg: "bg-emerald-500", Icon: Trophy },
    { label: "Конверсия", value: conversion, isAmount: false, suffix: "%", bg: "bg-orange-500", Icon: Percent },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        {/* Animations */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUpFadeIn {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes cardStagger {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .dash-card-enter {
            opacity: 0;
            animation: slideUpFadeIn 500ms ease-out forwards;
          }
          .deal-card-enter {
            opacity: 0;
            animation: cardStagger 350ms ease-out forwards;
          }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Сделки</h1>
                <p className="text-sm text-muted-foreground mt-1">Воронка продаж и управление сделками</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Новая сделка
              </Button>
            </div>

            {/* ═══ Summary Cards — colored ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {summaryCards.map((card, i) => (
                <div
                  key={card.label}
                  className={`dash-card-enter rounded-xl shadow-sm p-5 text-white ${card.bg} hover:scale-[1.02] hover:shadow-lg transition-all duration-300 cursor-default`}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-white/90">{card.label}</span>
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <card.Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-white tabular-nums">
                    {card.isAmount ? <CountUpAmount value={card.value} /> : <CountUp value={card.value} />}
                    {card.suffix ?? ""}
                  </p>
                </div>
              ))}
            </div>

            {/* ═══ Filters ═══ */}
            <div className="flex items-center gap-3 mb-5">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-10 rounded-xl" placeholder="Поиск по названию, компании..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[170px] h-10 rounded-xl"><SelectValue placeholder="Приоритет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все приоритеты</SelectItem>
                  {DEAL_PRIORITIES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ═══ Kanban Board ═══ */}
            <div className="flex gap-3 overflow-x-auto pb-4">
              {DEAL_STAGES.map((stage) => {
                const cards = grouped[stage.id] || []
                const colAmount = cards.reduce((s, d) => s + (d.amount || 0), 0)
                const isOver = dragOverStage === stage.id

                return (
                  <div
                    key={stage.id}
                    className={`flex-shrink-0 w-[280px] rounded-xl transition-all duration-200 ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : "bg-muted/30"}`}
                    style={{ borderTop: `3px solid ${stage.color}` }}
                    onDragOver={(e) => handleDragOver(e, stage.id)}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => handleDrop(e, stage.id)}
                  >
                    {/* Column header */}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span className="font-semibold text-sm">{stage.label}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs font-semibold">{cards.length}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground ml-[18px]">
                        {colAmount > 0 ? formatAmount(colAmount) : "0 ₽"}
                      </p>
                    </div>

                    {/* Cards */}
                    <div className="px-2 pb-2 space-y-2 min-h-[300px]">
                      {cards.map((deal, cardIdx) => {
                        const pr = DEAL_PRIORITIES.find((p) => p.id === deal.priority)
                        const borderColor = PRIORITY_BORDER[deal.priority] || "#6B7280"
                        return (
                          <div
                            key={deal.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, deal.id)}
                            onClick={() => router.push(`/sales/deals/${deal.id}`)}
                            className={`deal-card-enter group cursor-pointer rounded-xl bg-[var(--card)] border border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${dragDealId === deal.id ? "opacity-40 scale-95" : ""}`}
                            style={{
                              animationDelay: `${cardIdx * 50}ms`,
                              borderLeft: `3px solid ${borderColor}`,
                            }}
                          >
                            <div className="p-3">
                              <div className="flex items-start justify-between mb-1.5">
                                <h3 className="text-sm font-semibold leading-tight line-clamp-2 flex-1">{deal.title}</h3>
                                <GripVertical className="w-4 h-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1 transition-opacity" />
                              </div>
                              {deal.amount != null && (
                                <p className="text-base font-bold mb-2">{formatAmount(deal.amount, deal.currency)}</p>
                              )}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pr?.color }} />
                                  {deal.companyName && <span className="truncate max-w-[130px]">{deal.companyName}</span>}
                                </div>
                                {deal.assignedToName && (
                                  <Avatar className="w-7 h-7">
                                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                                      {deal.assignedToName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Empty state */}
                      {cards.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                          <div className="w-12 h-12 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-2 opacity-50">
                            <PackageOpen className="w-5 h-5 text-muted-foreground/50" />
                          </div>
                          <p className="text-xs text-muted-foreground/50 text-center">Перетащите сделку сюда</p>
                        </div>
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
