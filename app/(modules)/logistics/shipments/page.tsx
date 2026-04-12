"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Truck, CheckCircle, AlertTriangle, FileText,
  Eye, EyeOff, LayoutGrid, List, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Shipment {
  id: string; route: string; type: string; client: string; carrier: string
  shipDate: string; eta: string; status: string; progress: number
}

const SHIPMENTS: Shipment[] = [
  { id: "LOG-091", route: "Москва → Алматы", type: "🚛", client: "ТехноСтрой", carrier: "ТрансКом", shipDate: "08.04", eta: "14.04", status: "in_transit", progress: 75 },
  { id: "LOG-090", route: "Шанхай → Владивосток", type: "🚢", client: "СтройМаркет", carrier: "COSCO", shipDate: "05.04", eta: "19.04", status: "in_transit", progress: 45 },
  { id: "LOG-089", route: "Стамбул → Москва", type: "🚛", client: "МебельГрупп", carrier: "АвтоЛогистик", shipDate: "03.04", eta: "10.04", status: "delayed", progress: 60 },
  { id: "LOG-088", route: "Москва → Ташкент", type: "✈️", client: "ФармаЛогик", carrier: "Аэрофлот Карго", shipDate: "11.04", eta: "12.04", status: "delivered", progress: 100 },
  { id: "LOG-087", route: "Гуанчжоу → Новосибирск", type: "🚢", client: "ЭлектроТрейд", carrier: "MSC", shipDate: "28.03", eta: "25.04", status: "in_transit", progress: 30 },
  { id: "LOG-086", route: "Минск → Москва", type: "🚛", client: "БелТекстиль", carrier: "МинскТранс", shipDate: "10.04", eta: "12.04", status: "delivered", progress: 100 },
  { id: "LOG-085", route: "Москва → Бишкек", type: "🚛", client: "КыргызПродукт", carrier: "КазТрансГрупп", shipDate: "12.04", eta: "18.04", status: "loading", progress: 10 },
  { id: "LOG-084", route: "Дубай → Москва", type: "✈️", client: "ГолдИмпорт", carrier: "Emirates SkyCargo", shipDate: "12.04", eta: "13.04", status: "in_transit", progress: 50 },
  { id: "LOG-083", route: "Москва → Тбилиси", type: "🚛", client: "ВиноГрад", carrier: "ГрузТранс", shipDate: "09.04", eta: "13.04", status: "customs", progress: 85 },
  { id: "LOG-082", route: "Шэньчжэнь → Москва", type: "🚢", client: "ТехноИмпорт", carrier: "Maersk", shipDate: "01.04", eta: "30.04", status: "in_transit", progress: 20 },
]

const STATUS_MAP: Record<string, { label: string; cls: string; barColor: string }> = {
  loading:    { label: "Загрузка",   cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400", barColor: "#6B7280" },
  in_transit: { label: "В пути",     cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400", barColor: "#3B82F6" },
  customs:    { label: "На таможне", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", barColor: "#F59E0B" },
  delivered:  { label: "Доставлена", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", barColor: "#10B981" },
  delayed:    { label: "Задержка",   cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400", barColor: "#EF4444" },
}

const TIMELINE = [
  { date: "08.04 09:00", text: "Груз забран (Москва)", done: true },
  { date: "08.04 11:30", text: "Отгрузка. Водитель Смирнов А.В., ГАЗ Next М234КА77", done: true },
  { date: "09.04 06:15", text: "Оренбург, 1450 км", done: true },
  { date: "10.04 14:00", text: "Граница РФ/КЗ, таможня 2ч 10мин", done: true },
  { date: "11.04 08:30", text: "В пути: Актобе → Кызылорда, 2800 км", current: true },
  { date: "~13.04", text: "Прибытие Алматы", pending: true },
  { date: "~14.04", text: "Разгрузка", pending: true },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogisticsShipmentsPage() {
  const [view, setView] = useState<"table" | "cards">("table")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const inTransit = SHIPMENTS.filter((s) => s.status === "in_transit").length
  const delivered = SHIPMENTS.filter((s) => s.status === "delivered").length
  const delayed = SHIPMENTS.filter((s) => s.status === "delayed").length
  const waitDocs = 3

  const metrics = [
    { icon: Truck, label: "В пути", value: inTransit, color: "text-blue-500", bg: "bg-blue-500/10" },
    { icon: CheckCircle, label: "Доставлено", value: delivered, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { icon: AlertTriangle, label: "Задержки", value: delayed, color: "text-red-500", bg: "bg-red-500/10" },
    { icon: FileText, label: "Ждут документы", value: waitDocs, color: "text-amber-500", bg: "bg-amber-500/10" },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Активные перевозки</h1>
              <p className="text-sm text-muted-foreground mt-1">Трекинг и управление перевозками</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${m.bg} flex items-center justify-center`}>
                    <m.icon className={`w-5 h-5 ${m.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-xl font-bold">{m.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center justify-end gap-1 mb-4">
              <Button variant={view === "table" ? "default" : "ghost"} size="sm" className="h-8 gap-1" onClick={() => setView("table")}><List className="w-3.5 h-3.5" />Таблица</Button>
              <Button variant={view === "cards" ? "default" : "ghost"} size="sm" className="h-8 gap-1" onClick={() => setView("cards")}><LayoutGrid className="w-3.5 h-3.5" />Карточки</Button>
            </div>

            {/* Table view */}
            {view === "table" && (
              <div className="rounded-xl border border-border shadow-sm bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        {["#", "Маршрут", "Тип", "Клиент", "Перевозчик", "Отгрузка", "ETA", "Статус", "Прогресс", ""].map((h) => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SHIPMENTS.map((s) => {
                        const st = STATUS_MAP[s.status]
                        const isExp = expandedId === s.id
                        return (
                          <>
                            <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{s.id}</td>
                              <td className="px-4 py-3 text-sm font-medium">{s.route}</td>
                              <td className="px-4 py-3 text-center">{s.type}</td>
                              <td className="px-4 py-3 text-sm">{s.client}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{s.carrier}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{s.shipDate}</td>
                              <td className="px-4 py-3 text-sm">{s.eta}</td>
                              <td className="px-4 py-3">
                                <Badge variant="secondary" className={`text-[10px] border-0 font-medium ${st?.cls}`}>{st?.label}</Badge>
                              </td>
                              <td className="px-4 py-3 w-32">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${s.progress}%`, backgroundColor: st?.barColor }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-8 text-right">{s.progress}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setExpandedId(isExp ? null : s.id)}>
                                  {isExp ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  Трекинг
                                </Button>
                              </td>
                            </tr>
                            {isExp && (
                              <tr key={`${s.id}-track`}>
                                <td colSpan={10} className="p-0">
                                  <div className="px-6 py-5 bg-muted/20 border-b border-border">
                                    <div className="grid grid-cols-3 gap-6">
                                      {/* Timeline */}
                                      <div className="col-span-2">
                                        <h4 className="text-sm font-semibold mb-3">Трекинг</h4>
                                        <div className="space-y-0">
                                          {TIMELINE.map((t, i) => (
                                            <div key={i} className="flex gap-3">
                                              <div className="flex flex-col items-center">
                                                <div className={cn(
                                                  "w-3 h-3 rounded-full border-2 shrink-0",
                                                  t.done ? "bg-emerald-500 border-emerald-500" :
                                                  "current" in t && t.current ? "bg-blue-500 border-blue-500 animate-pulse" :
                                                  "bg-transparent border-muted-foreground/30"
                                                )} />
                                                {i < TIMELINE.length - 1 && (
                                                  <div className={cn("w-0.5 flex-1 min-h-[24px]", t.done ? "bg-emerald-500" : "bg-muted-foreground/20")} />
                                                )}
                                              </div>
                                              <div className="pb-4">
                                                <p className="text-xs text-muted-foreground">{t.date}</p>
                                                <p className={cn("text-sm", "current" in t && t.current ? "font-semibold text-blue-600 dark:text-blue-400" : t.done ? "" : "text-muted-foreground")}>{t.text}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      {/* Info */}
                                      <div className="space-y-4">
                                        <div className="rounded-lg border border-border/50 p-3 space-y-2 text-sm">
                                          <div className="flex justify-between"><span className="text-muted-foreground">Перевозчик</span><span className="font-medium">{s.carrier}</span></div>
                                          <div className="flex justify-between"><span className="text-muted-foreground">Водитель</span><span>Смирнов А.В.</span></div>
                                          <div className="flex justify-between"><span className="text-muted-foreground">Транспорт</span><span>ГАЗ Next М234КА77</span></div>
                                        </div>
                                        <div className="rounded-lg border border-border/50 p-3">
                                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Документы</p>
                                          <div className="flex gap-2 text-xs">
                                            <span className="text-emerald-600">CMR ✅</span>
                                            <span className="text-emerald-600">ТТН ✅</span>
                                            <span className="text-emerald-600">Инвойс ✅</span>
                                          </div>
                                        </div>
                                        <div className="rounded-lg border bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-3">
                                          <div className="flex items-center gap-1.5 mb-1">
                                            <Sparkles className="w-4 h-4 text-primary" />
                                            <span className="text-xs font-medium">AI-статус</span>
                                          </div>
                                          <p className="text-xs">Перевозка по графику. ETA не изменилось.</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cards view */}
            {view === "cards" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SHIPMENTS.map((s) => {
                  const st = STATUS_MAP[s.status]
                  const isDelayed = s.status === "delayed"
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-xl border bg-card p-5 hover:shadow-md transition-all",
                        isDelayed ? "border-red-300 bg-red-50/50 dark:bg-red-950/10 dark:border-red-500/30" : "border-border/60"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{s.type}</span>
                          <span className="font-mono text-sm text-muted-foreground">{s.id}</span>
                        </div>
                        <Badge variant="secondary" className={`text-[10px] border-0 font-medium ${st?.cls}`}>{st?.label}</Badge>
                      </div>
                      <p className="font-semibold text-sm mb-1">{s.route}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <span>{s.client}</span>
                        <span>{s.carrier}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${s.progress}%`, backgroundColor: st?.barColor }} />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{s.progress}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">ETA: {s.eta}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
