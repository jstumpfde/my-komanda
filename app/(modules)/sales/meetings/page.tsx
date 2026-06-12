"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, Plus, Clock, User, Scissors, Phone, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ─── Типы ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string
  serviceId: string | null
  resourceId: string | null
  clientName: string
  clientPhone: string | null
  date: string
  startTime: string
  endTime: string
  status: string
  notes: string | null
  price: number | null
  serviceName: string | null
  serviceColor: string | null
  serviceDuration: number | null
  resourceName: string | null
}

interface SvcOpt { id: string; name: string; duration: number; price: number | null }
interface ResOpt { id: string; name: string }

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  confirmed: { label: "Запланировано", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "Завершено", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelled: { label: "Отменено", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  no_show:   { label: "Не пришёл", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]

function pad(n: number) { return String(n).padStart(2, "0") }
function isoDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function shortDate(iso: string) { const [, m, d] = iso.split("-"); return `${d}.${m}` }
function addMinutes(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const t = h * 60 + m + min
  return `${pad(Math.floor((t % 1440) / 60))}:${pad(t % 60)}`
}
function formatPrice(kopecks: number | null) {
  if (kopecks == null) return null
  return `${Math.round(kopecks / 100)}₽`
}

export default function SalesMeetingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<SvcOpt[]>([])
  const [resources, setResources] = useState<ResOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Booking | null>(null)

  const [form, setForm] = useState({ serviceId: "", resourceId: "", date: "", time: "", clientName: "", clientPhone: "", notes: "" })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/booking/bookings")
      const j = await res.json()
      const d = j?.data ?? j
      setBookings((d.bookings ?? []) as Booking[])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch("/api/modules/booking/services")
      .then((r) => r.json())
      .then((j) => { const d = j?.data ?? j; setServices((d.services ?? []) as SvcOpt[]) })
      .catch(() => {})
    fetch("/api/modules/booking/resources")
      .then((r) => r.json())
      .then((j) => { const d = j?.data ?? j; setResources(((d.resources ?? []) as ResOpt[])) })
      .catch(() => {})
  }, [])

  const todayStr = isoDate(new Date())

  const { today, upcoming, past } = useMemo(() => {
    const t: Booking[] = [], u: Booking[] = [], p: Booking[] = []
    for (const b of bookings) {
      const active = b.status === "confirmed"
      if (active && b.date === todayStr) t.push(b)
      else if (active && b.date > todayStr) u.push(b)
      else p.push(b)
    }
    return { today: t, upcoming: u, past: p }
  }, [bookings, todayStr])

  // Неделя (Пн–Вс) с количеством записей по датам.
  const week = useMemo(() => {
    const now = new Date()
    const monday = new Date(now); const off = (now.getDay() + 6) % 7
    monday.setDate(now.getDate() - off)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i)
      const iso = isoDate(d)
      return { iso, label: `${WD[d.getDay()]} ${shortDate(iso)}`, today: iso === todayStr, count: bookings.filter((b) => b.date === iso && b.status === "confirmed").length }
    })
  }, [bookings, todayStr])

  const handleCreate = async () => {
    if (!form.serviceId) { toast.error("Выберите услугу"); return }
    if (!form.clientName.trim()) { toast.error("Введите имя клиента"); return }
    if (!form.date || !form.time) { toast.error("Укажите дату и время"); return }
    const svc = services.find((s) => s.id === form.serviceId)
    const endTime = addMinutes(form.time, svc?.duration ?? 60)
    setSaving(true)
    try {
      const res = await fetch("/api/modules/booking/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: form.serviceId,
          resourceId: form.resourceId || null,
          clientName: form.clientName.trim(),
          clientPhone: form.clientPhone || null,
          date: form.date,
          startTime: form.time,
          endTime,
          notes: form.notes || null,
          price: svc?.price ?? null,
        }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error)
      }
      setSheetOpen(false)
      setForm({ serviceId: "", resourceId: "", date: "", time: "", clientName: "", clientPhone: "", notes: "" })
      toast.success("Запись создана")
      load()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось создать запись")
    } finally {
      setSaving(false)
    }
  }

  function BookingCard({ b }: { b: Booking }) {
    const st = STATUS_DISPLAY[b.status] ?? STATUS_DISPLAY.confirmed
    return (
      <div
        className={cn("border rounded-xl p-4 bg-card cursor-pointer hover:bg-muted/30 transition-colors", b.date === todayStr && b.status === "confirmed" && "border-primary/50 bg-primary/5")}
        onClick={() => setSelected(b)}
      >
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (b.serviceColor || "#6B7280") + "22" }}>
            <Scissors className="w-4 h-4" style={{ color: b.serviceColor || "#6B7280" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{b.serviceName || "Услуга"}</p>
            <p className="text-xs text-muted-foreground truncate">{b.clientName}</p>
          </div>
          <Badge className={cn("text-xs border-0 shrink-0", st.color)}>{st.label}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{shortDate(b.date)} {b.startTime}–{b.endTime}</div>
          {b.resourceName && <div className="flex items-center gap-1"><User className="w-3 h-3" />{b.resourceName}</div>}
          {formatPrice(b.price) && <span className="font-medium text-foreground">{formatPrice(b.price)}</span>}
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Встречи и записи</h1>
                  <p className="text-sm text-muted-foreground">Записи клиентов на услуги</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)} disabled={services.length === 0}>
                <Plus className="w-4 h-4" />
                Записать
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
              </div>
            ) : (
              <>
                {/* Неделя */}
                <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
                  {week.map((day) => (
                    <div key={day.iso} className={cn("flex-1 min-w-[68px] text-center p-2 rounded-xl border text-xs transition-colors", day.today ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border")}>
                      <p className="font-medium">{day.label.split(" ")[0]}</p>
                      <p className={cn("text-[10px]", day.today ? "text-primary-foreground/80" : "text-muted-foreground")}>{day.label.split(" ")[1]}</p>
                      {day.count > 0 && (
                        <div className={cn("w-4 h-4 rounded-full flex items-center justify-center mx-auto mt-1 text-[9px] font-bold", day.today ? "bg-white text-primary" : "bg-primary text-white")}>{day.count}</div>
                      )}
                    </div>
                  ))}
                </div>

                {bookings.length === 0 ? (
                  <div className="text-center py-16 border rounded-xl bg-card">
                    <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-medium text-foreground">Записей пока нет</p>
                    <p className="text-sm text-muted-foreground">{services.length === 0 ? "Сначала добавьте услуги в Настройках CRM." : "Нажмите «Записать», чтобы создать первую."}</p>
                  </div>
                ) : (
                  <>
                    {today.length > 0 && (
                      <div className="mb-6">
                        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          Сегодня · {today.length}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{today.map((b) => <BookingCard key={b.id} b={b} />)}</div>
                      </div>
                    )}
                    {upcoming.length > 0 && (
                      <div className="mb-6">
                        <h2 className="text-sm font-semibold text-foreground mb-3">Предстоящие</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{upcoming.map((b) => <BookingCard key={b.id} b={b} />)}</div>
                      </div>
                    )}
                    {past.length > 0 && (
                      <div>
                        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Прошедшие</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-70">{past.map((b) => <BookingCard key={b.id} b={b} />)}</div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Создание записи */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />Новая запись</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Услуга *</Label>
              <Select value={form.serviceId} onValueChange={(v) => setForm((p) => ({ ...p, serviceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите услугу" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.price != null ? ` · ${Math.round(s.price / 100)}₽` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {resources.length > 0 && (
              <div className="space-y-1.5">
                <Label>Мастер</Label>
                <Select value={form.resourceId} onValueChange={(v) => setForm((p) => ({ ...p, resourceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Любой" /></SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Дата *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Время *</Label>
                <Input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Клиент *</Label>
              <Input placeholder="Имя клиента" value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input placeholder="+7…" value={form.clientPhone} onChange={(e) => setForm((p) => ({ ...p, clientPhone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Заметка</Label>
              <Textarea placeholder="Комментарий к записи…" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Записать
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Детали записи */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (selected.serviceColor || "#6B7280") + "22" }}>
                    <Scissors className="w-5 h-5" style={{ color: selected.serviceColor || "#6B7280" }} />
                  </div>
                  <div>
                    <SheetTitle>{selected.serviceName || "Услуга"}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{(STATUS_DISPLAY[selected.status] ?? STATUS_DISPLAY.confirmed).label}</p>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-4 h-4" /><span>{shortDate(selected.date)} в {selected.startTime}–{selected.endTime}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><User className="w-4 h-4" /><span>{selected.clientName}</span></div>
                {selected.clientPhone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" /><span>{selected.clientPhone}</span></div>}
                {selected.resourceName && <div className="flex items-center gap-2 text-muted-foreground"><Scissors className="w-4 h-4" /><span>{selected.resourceName}</span></div>}
                {formatPrice(selected.price) && <div className="font-semibold text-foreground">{formatPrice(selected.price)}</div>}
                {selected.notes && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">ЗАМЕТКА</p>
                    <p className="text-sm text-foreground">{selected.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
