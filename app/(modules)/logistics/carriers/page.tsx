"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Building2, Plus, Search, Star, Eye, EyeOff, Send,
  Truck, Ship, Plane, Train, Shield, MapPin,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Carrier {
  id: string; name: string; type: string; regions: string; rating: number
  reviews: number; reliability: number; contact: string; phone: string
  lastShipment: string; status: string
}

const CARRIERS: Carrier[] = [
  { id: "1", name: "ТрансКом", type: "🚛", regions: "РФ + КЗ", rating: 4.5, reviews: 23, reliability: 96, contact: "Иванов", phone: "+7(495)123-45-67", lastShipment: "08.04", status: "active" },
  { id: "2", name: "КазТрансГрупп", type: "🚛", regions: "КЗ + КГ + УЗ", rating: 4.3, reviews: 18, reliability: 92, contact: "Ахметов", phone: "+7(727)234-56-78", lastShipment: "12.04", status: "active" },
  { id: "3", name: "АвтоЛогистик", type: "🚛", regions: "РФ + Турция", rating: 3.8, reviews: 12, reliability: 85, contact: "Петров", phone: "+7(812)345-67-89", lastShipment: "03.04", status: "active" },
  { id: "4", name: "МинскТранс", type: "🚛", regions: "Беларусь + РФ", rating: 4.7, reviews: 15, reliability: 98, contact: "Лукашевич", phone: "+375(29)456-78-90", lastShipment: "10.04", status: "active" },
  { id: "5", name: "ГрузТранс", type: "🚛", regions: "РФ + Грузия + Армения", rating: 4.1, reviews: 9, reliability: 89, contact: "Мамедов", phone: "+7(495)567-89-01", lastShipment: "09.04", status: "active" },
  { id: "6", name: "COSCO", type: "🚢", regions: "Китай → мир", rating: 4.4, reviews: 31, reliability: 94, contact: "Wang Li", phone: "+86-21-xxxx", lastShipment: "05.04", status: "active" },
  { id: "7", name: "MSC", type: "🚢", regions: "Весь мир", rating: 4.2, reviews: 28, reliability: 91, contact: "Agent MSK", phone: "+7(495)678-90-12", lastShipment: "28.03", status: "active" },
  { id: "8", name: "Maersk", type: "🚢", regions: "Весь мир", rating: 4.6, reviews: 35, reliability: 97, contact: "Agent SPB", phone: "+7(812)789-01-23", lastShipment: "01.04", status: "active" },
  { id: "9", name: "FESCO", type: "🚢 + 🚂", regions: "Китай → РФ", rating: 4.0, reviews: 14, reliability: 88, contact: "Сидоров", phone: "+7(423)890-12-34", lastShipment: "15.03", status: "active" },
  { id: "10", name: "Аэрофлот Карго", type: "✈️", regions: "РФ + СНГ", rating: 4.3, reviews: 8, reliability: 93, contact: "Козлова", phone: "+7(495)901-23-45", lastShipment: "11.04", status: "active" },
  { id: "11", name: "Emirates SkyCargo", type: "✈️", regions: "ОАЭ → мир", rating: 4.8, reviews: 12, reliability: 99, contact: "Dubai", phone: "+971-4-xxx", lastShipment: "12.04", status: "active" },
  { id: "12", name: "ЕвроТрак", type: "🚛", regions: "Европа → РФ", rating: 3.5, reviews: 7, reliability: 82, contact: "Schmidt", phone: "+49-xxx", lastShipment: "20.03", status: "paused" },
]

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active: { label: "Активен",      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  paused: { label: "Приостановлен", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("w-3.5 h-3.5", i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  )
}

function reliabilityColor(r: number) {
  if (r >= 90) return "#10B981"
  if (r >= 80) return "#F59E0B"
  return "#EF4444"
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogisticsCarriersPage() {
  const [carriers, setCarriers] = useState(CARRIERS)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterRating, setFilterRating] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: "", type: "🚛", regions: "", contact: "", phone: "", email: "", comment: "" })

  const filtered = carriers.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.contact.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType !== "all" && !c.type.includes(filterType)) return false
    if (filterRating === "4+" && c.rating < 4) return false
    if (filterRating === "4.5+" && c.rating < 4.5) return false
    return true
  })

  const handleCreate = () => {
    if (!form.name.trim()) return
    const newC: Carrier = {
      id: String(Date.now()), name: form.name, type: form.type, regions: form.regions || "—",
      rating: 0, reviews: 0, reliability: 0, contact: form.contact, phone: form.phone,
      lastShipment: "—", status: "active",
    }
    setCarriers((prev) => [newC, ...prev])
    setModalOpen(false)
    setForm({ name: "", type: "🚛", regions: "", contact: "", phone: "", email: "", comment: "" })
    toast.success("Перевозчик добавлен")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">База перевозчиков</h1>
                <p className="text-sm text-muted-foreground mt-1">Управление партнёрами и ставками</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить перевозчика
              </Button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { icon: Building2, label: "Всего", value: carriers.length, color: "text-blue-500", bg: "bg-blue-500/10" },
                { icon: Star, label: "Средний рейтинг", value: "4.2", color: "text-amber-500", bg: "bg-amber-500/10" },
                { icon: Truck, label: "Активных", value: carriers.filter((c) => c.status === "active").length, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              ].map((m) => (
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

            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-10 rounded-xl" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px] h-10 rounded-xl"><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="🚛">Авто</SelectItem>
                  <SelectItem value="🚢">Море</SelectItem>
                  <SelectItem value="✈️">Авиа</SelectItem>
                  <SelectItem value="🚂">Ж/Д</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-[140px] h-10 rounded-xl"><SelectValue placeholder="Рейтинг" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Любой</SelectItem>
                  <SelectItem value="4+">4+ звёзд</SelectItem>
                  <SelectItem value="4.5+">4.5+ звёзд</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border shadow-sm bg-card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["Название", "Тип", "Регионы", "Рейтинг", "Надёжность", "Контакт", "Посл. перевозка", "Статус", ""].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const st = STATUS_MAP[c.status]
                      const isExp = expandedId === c.id
                      return (
                        <>
                          <tr key={c.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                            <td className="px-4 py-3 text-center">{c.type}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{c.regions}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <Stars rating={c.rating} />
                                <span className="text-xs text-muted-foreground">{c.rating}({c.reviews})</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 w-28">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${c.reliability}%`, backgroundColor: reliabilityColor(c.reliability) }} />
                                </div>
                                <span className="text-xs font-medium w-8 text-right">{c.reliability}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{c.contact}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{c.lastShipment}</td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className={`text-[10px] border-0 font-medium ${st?.cls}`}>{st?.label}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setExpandedId(isExp ? null : c.id)}>
                                  {isExp ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => toast.success(`Запрос отправлен ${c.name}`)}>
                                  <Send className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isExp && (
                            <tr key={`${c.id}-detail`}>
                              <td colSpan={9} className="p-0">
                                <div className="px-6 py-5 bg-muted/20 border-b border-border">
                                  <div className="grid grid-cols-2 gap-6">
                                    <div>
                                      <h4 className="text-sm font-semibold mb-2">{c.name}</h4>
                                      <div className="space-y-1.5 text-sm">
                                        <div className="flex gap-2"><span className="text-muted-foreground w-20">ИНН:</span><span>770{c.id}234567</span></div>
                                        <div className="flex gap-2"><span className="text-muted-foreground w-20">Адрес:</span><span>г. Москва, ул. Транспортная {c.id}</span></div>
                                        <div className="flex gap-2"><span className="text-muted-foreground w-20">Контакт:</span><span>{c.contact} · {c.phone}</span></div>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="flex flex-wrap gap-1.5 mb-3">
                                        {c.type.split("+").map((t) => t.trim()).map((t) => (
                                          <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                                        ))}
                                      </div>
                                      <div className="flex flex-wrap gap-1.5 mb-3">
                                        {c.regions.split("+").map((r) => r.trim()).map((r) => (
                                          <span key={r} className="text-xs rounded-full border border-border px-2 py-0.5">{r}</span>
                                        ))}
                                      </div>
                                      <div className="flex gap-3 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1"><Shield className="w-3 h-3" />Страхование: да</span>
                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />GPS-трекинг: да</span>
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
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">Не найдено</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Add modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" />Добавить перевозчика</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5"><Label>Название *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ТрансКом" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="🚛">🚛 Авто</SelectItem>
                    <SelectItem value="🚢">🚢 Море</SelectItem>
                    <SelectItem value="✈️">✈️ Авиа</SelectItem>
                    <SelectItem value="🚂">🚂 Ж/Д</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Регионы</Label><Input value={form.regions} onChange={(e) => setForm((p) => ({ ...p, regions: e.target.value }))} placeholder="РФ + КЗ" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Контакт</Label><Input value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} placeholder="Иванов И.И." /></div>
              <div className="space-y-1.5"><Label>Телефон</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+7..." /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="info@carrier.ru" /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate} disabled={!form.name.trim()}>Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
