"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Inbox, Plus, Search, Mail, Clock, Send, CheckCircle, Calculator,
} from "lucide-react"
import { toast } from "sonner"

// ─── Types & Data ─────────────────────────────────────────────────────────────

interface Request {
  id: string; date: string; client: string; contact: string; route: string
  type: string; cargo: string; status: string; source: string
}

const INITIAL: Request[] = [
  { id: "REQ-0041", date: "12.04", client: "ТехноСтрой", contact: "Иванов А.С.", route: "Москва → Алматы", type: "🚛 FTL", cargo: "Стройматериалы 18т", status: "new", source: "incoming" },
  { id: "REQ-0040", date: "12.04", client: "ФармаЛогик", contact: "Петрова Е.В.", route: "Москва → Ташкент", type: "✈️", cargo: "Медикаменты 2.5т", status: "new", source: "incoming" },
  { id: "REQ-0039", date: "11.04", client: "ГолдИмпорт", contact: "Сидоров К.М.", route: "Дубай → Москва", type: "✈️", cargo: "Электроника 8т", status: "in_progress", source: "tender" },
  { id: "REQ-0038", date: "11.04", client: "СтройМаркет", contact: "Козлов Д.А.", route: "Шанхай → Владивосток", type: "🚢 FCL 40'", cargo: "Оборудование 24т", status: "in_progress", source: "repeat" },
  { id: "REQ-0037", date: "10.04", client: "МебельГрупп", contact: "Новикова И.П.", route: "Стамбул → Москва", type: "🚛 FTL", cargo: "Мебель 20т", status: "offer_sent", source: "incoming" },
  { id: "REQ-0036", date: "10.04", client: "ЭлектроТрейд", contact: "Морозов В.С.", route: "Гуанчжоу → Новосибирск", type: "🚢 FCL 20'", cargo: "Электроника 12т", status: "offer_sent", source: "tender" },
  { id: "REQ-0035", date: "09.04", client: "БелТекстиль", contact: "Волкова А.Р.", route: "Минск → Москва", type: "🚛 LTL", cargo: "Текстиль 6т", status: "closed_accepted", source: "repeat" },
  { id: "REQ-0034", date: "09.04", client: "КыргызПродукт", contact: "Алиев Т.Б.", route: "Москва → Бишкек", type: "🚛 FTL", cargo: "Продукты 15т", status: "offer_sent", source: "incoming" },
  { id: "REQ-0033", date: "08.04", client: "ВиноГрад", contact: "Чернова М.Д.", route: "Москва → Тбилиси", type: "🚛 Рефриж.", cargo: "Вино 10т", status: "closed_accepted", source: "repeat" },
  { id: "REQ-0032", date: "08.04", client: "ТехноИмпорт", contact: "Лебедев П.К.", route: "Шэньчжэнь → Москва", type: "🚢 FCL 40'HC", cargo: "Гаджеты 22т", status: "in_progress", source: "incoming" },
  { id: "REQ-0031", date: "07.04", client: "АвтоПарт", contact: "Григорьев С.Н.", route: "Москва → Астана", type: "🚛 FTL", cargo: "Запчасти 14т", status: "new", source: "incoming" },
  { id: "REQ-0030", date: "07.04", client: "ФудСервис", contact: "Кузнецова О.А.", route: "Москва → Душанбе", type: "🚛 Рефриж.", cargo: "Продукты 16т", status: "new", source: "tender" },
]

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new:             { label: "Новый",           cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  in_progress:     { label: "В работе",        cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  offer_sent:      { label: "Оффер отправлен", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
  closed_accepted: { label: "Закрыт (принят)", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  closed_rejected: { label: "Закрыт (отказ)",  cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
}

const SOURCE_MAP: Record<string, { label: string; cls: string }> = {
  incoming: { label: "Входящий",  cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
  tender:   { label: "Тендер",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  repeat:   { label: "Повторный", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
}

const TRANSPORT_OPTIONS = ["🚛 FTL", "🚛 LTL", "🚛 Рефриж.", "🚢 FCL 20'", "🚢 FCL 40'", "🚢 FCL 40'HC", "✈️ Авиа", "🚂 Ж/Д"]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogisticsRequestsPage() {
  const [requests, setRequests] = useState<Request[]>(INITIAL)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ client: "", contact: "", from: "", to: "", type: "🚛 FTL", cargo: "", weight: "", volume: "", comment: "" })

  const filtered = requests.filter((r) => {
    if (search && !r.client.toLowerCase().includes(search.toLowerCase()) && !r.contact.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType !== "all" && !r.type.includes(filterType)) return false
    if (filterStatus !== "all" && r.status !== filterStatus) return false
    return true
  })

  const newCount = requests.filter((r) => r.status === "new").length
  const inProgressCount = requests.filter((r) => r.status === "in_progress").length
  const offerCount = requests.filter((r) => r.status === "offer_sent").length

  const handleCreate = () => {
    if (!form.client.trim()) return
    const newReq: Request = {
      id: `REQ-${String(42 + requests.length).padStart(4, "0")}`,
      date: new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      client: form.client, contact: form.contact,
      route: `${form.from} → ${form.to}`, type: form.type,
      cargo: `${form.cargo}${form.weight ? ` ${form.weight}т` : ""}`,
      status: "new", source: "incoming",
    }
    setRequests((prev) => [newReq, ...prev])
    setModalOpen(false)
    setForm({ client: "", contact: "", from: "", to: "", type: "🚛 FTL", cargo: "", weight: "", volume: "", comment: "" })
    toast.success("Запрос создан")
  }

  const metrics = [
    { icon: Mail, label: "Новы��", value: newCount, color: "text-blue-500", bg: "bg-blue-500/10" },
    { icon: Clock, label: "В работе", value: inProgressCount, color: "text-amber-500", bg: "bg-amber-500/10" },
    { icon: Send, label: "Оф��еров", value: offerCount, color: "text-purple-500", bg: "bg-purple-500/10" },
    { icon: CheckCircle, label: "Конверсия", value: 67, color: "text-emerald-500", bg: "bg-emerald-500/10", suffix: "%" },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Запросы на расчёт</h1>
                <p className="text-sm text-muted-foreground mt-1">Входящие запросы и офферы клиентам</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Новый запрос
              </Button>
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
                    <p className="text-xl font-bold">{m.value}{"suffix" in m ? m.suffix : ""}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-10 rounded-xl" placeholder="Поиск по клиенту..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px] h-10 rounded-xl"><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="🚛">Авто</SelectItem>
                  <SelectItem value="🚢">Море</SelectItem>
                  <SelectItem value="✈️">Авиа</SelectItem>
                  <SelectItem value="🚂">Ж/Д</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px] h-10 rounded-xl"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border shadow-sm bg-card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["#", "Дата", "Клиент", "Контакт", "Маршрут", "Тип", "Груз", "Статус", "Источник", ""].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const st = STATUS_MAP[r.status]
                      const src = SOURCE_MAP[r.source]
                      return (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{r.id}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{r.date}</td>
                          <td className="px-4 py-3 text-sm font-medium">{r.client}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{r.contact}</td>
                          <td className="px-4 py-3 text-sm">{r.route}</td>
                          <td className="px-4 py-3 text-sm">{r.type}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{r.cargo}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={`text-[10px] border-0 font-medium ${st?.cls}`}>{st?.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={`text-[10px] border-0 ${src?.cls}`}>{src?.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {(r.status === "new" || r.status === "in_progress") && (
                              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => toast.info("Перенаправление в расчёты...")}>
                                <Calculator className="w-3 h-3" />
                                Рассчитать
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">Нет запросов</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Create Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Inbox className="w-5 h-5" />Новый запрос</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Клиент *</Label><Input value={form.client} onChange={(e) => setForm((p) => ({ ...p, client: e.target.value }))} placeholder="ООО Компания" /></div>
              <div className="space-y-1.5"><Label>Контакт</Label><Input value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} placeholder="Иванов И.И." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Откуда</Label><Input value={form.from} onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))} placeholder="Москва" /></div>
              <div className="space-y-1.5"><Label>Куда</Label><Input value={form.to} onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))} placeholder="Алматы" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Тип перевозки</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSPORT_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Груз</Label><Input value={form.cargo} onChange={(e) => setForm((p) => ({ ...p, cargo: e.target.value }))} placeholder="Стройматериалы" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Вес (т)</Label><Input value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} placeholder="18" /></div>
              <div className="space-y-1.5"><Label>Объём (м³)</Label><Input value={form.volume} onChange={(e) => setForm((p) => ({ ...p, volume: e.target.value }))} placeholder="60" /></div>
            </div>
            <div className="space-y-1.5"><Label>Комментарий</Label><Textarea value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} rows={2} placeholder="Особые условия..." /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate} disabled={!form.client.trim()}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
