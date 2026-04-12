"use client"

import { useState, useEffect, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  CalendarCheck, Plus, ChevronLeft, ChevronRight,
  TrendingUp, DollarSign, CalendarDays, XCircle,
  Check, CheckCheck, X, UserX,
} from "lucide-react"
import { toast } from "sonner"
import { BOOKING_STATUSES } from "@/lib/booking/constants"
import { BookingCreateModal } from "@/components/booking/booking-create-modal"

// ─── CountUp ──────────────────────────────────────────────────────────────────

function useCountUp(target: number | null, dur = 1000) {
  const [d, setD] = useState(0)
  useEffect(() => {
    if (target == null) return
    const start = d, delta = target - start
    if (!delta) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      setD(Math.round(start + delta * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, dur])
  return d
}

function CountUp({ value }: { value: number | null }) {
  const d = useCountUp(value)
  return <>{value == null ? "…" : d}</>
}

function CountUpMoney({ value }: { value: number | null }) {
  const d = useCountUp(value)
  if (value == null) return <>…</>
  if (d >= 100_000_00) return <>{(d / 100_000_00).toFixed(1).replace(/\.0$/, "")} млн ₽</>
  if (d >= 1_000_00) return <>{Math.round(d / 1_000_00)} тыс ₽</>
  return <>{new Intl.NumberFormat("ru-RU").format(d / 100)} ₽</>
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingItem {
  id: string
  serviceId: string
  resourceId: string | null
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  date: string
  startTime: string
  endTime: string
  status: string
  notes: string | null
  price: number | null
  serviceName: string
  serviceColor: string
  resourceName: string | null
}

interface ServiceItem { id: string; name: string; duration: number; price: number | null; color: string }
interface ResourceItem { id: string; name: string; type: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

const HOURS = Array.from({ length: 19 }, (_, i) => `${String(i + 9).padStart(2, "0")}:00`)
  .concat(Array.from({ length: 18 }, (_, i) => `${String(i + 9).padStart(2, "0")}:30`))
  .sort()

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

// ─── Mock Data ────────────────────────────────────────────────────────────────

const today = new Date()
const monday = getMonday(today)

function mockDate(dayOffset: number) {
  const d = new Date(monday)
  d.setDate(d.getDate() + dayOffset)
  return dateStr(d)
}

const MOCK_SERVICES: ServiceItem[] = [
  { id: "s1", name: "Консультация", duration: 60, price: 300000, color: "#3B82F6" },
  { id: "s2", name: "Диагностика", duration: 30, price: 150000, color: "#8B5CF6" },
  { id: "s3", name: "Процедура", duration: 90, price: 500000, color: "#10B981" },
]

const MOCK_RESOURCES: ResourceItem[] = [
  { id: "r1", name: "Кабинет 1", type: "room" },
  { id: "r2", name: "Доктор Иванова", type: "specialist" },
]

const MOCK_BOOKINGS: BookingItem[] = [
  { id: "b1", serviceId: "s1", resourceId: "r2", clientName: "Иванов Иван", clientPhone: "+79991112233", clientEmail: null, date: mockDate(0), startTime: "09:00", endTime: "10:00", status: "confirmed", notes: null, price: 300000, serviceName: "Консультация", serviceColor: "#3B82F6", resourceName: "Доктор Иванова" },
  { id: "b2", serviceId: "s2", resourceId: "r1", clientName: "Петрова Мария", clientPhone: "+79992223344", clientEmail: "m.petrova@mail.ru", date: mockDate(0), startTime: "10:30", endTime: "11:00", status: "confirmed", notes: null, price: 150000, serviceName: "Диагностика", serviceColor: "#8B5CF6", resourceName: "Кабинет 1" },
  { id: "b3", serviceId: "s3", resourceId: "r2", clientName: "Сидоров Алексей", clientPhone: "+79993334455", clientEmail: null, date: mockDate(0), startTime: "14:00", endTime: "15:30", status: "confirmed", notes: "Повторный визит", price: 500000, serviceName: "Процедура", serviceColor: "#10B981", resourceName: "Доктор Иванова" },
  { id: "b4", serviceId: "s1", resourceId: "r2", clientName: "Козлова Елена", clientPhone: "+79994445566", clientEmail: null, date: mockDate(1), startTime: "11:00", endTime: "12:00", status: "confirmed", notes: null, price: 300000, serviceName: "Консультация", serviceColor: "#3B82F6", resourceName: "Доктор Иванова" },
  { id: "b5", serviceId: "s2", resourceId: "r1", clientName: "Новиков Дмитрий", clientPhone: null, clientEmail: "d.novikov@corp.ru", date: mockDate(1), startTime: "15:00", endTime: "15:30", status: "confirmed", notes: null, price: 150000, serviceName: "Диагностика", serviceColor: "#8B5CF6", resourceName: "Кабинет 1" },
  { id: "b6", serviceId: "s1", resourceId: "r2", clientName: "Морозова Анна", clientPhone: "+79996667788", clientEmail: null, date: mockDate(2), startTime: "09:00", endTime: "10:00", status: "confirmed", notes: null, price: 300000, serviceName: "Консультация", serviceColor: "#3B82F6", resourceName: "Доктор Иванова" },
  { id: "b7", serviceId: "s3", resourceId: "r1", clientName: "Волков Сергей", clientPhone: "+79997778899", clientEmail: null, date: mockDate(3), startTime: "10:00", endTime: "11:30", status: "confirmed", notes: null, price: 500000, serviceName: "Процедура", serviceColor: "#10B981", resourceName: "Кабинет 1" },
  { id: "b8", serviceId: "s2", resourceId: "r2", clientName: "Тихонова Ольга", clientPhone: null, clientEmail: null, date: mockDate(4), startTime: "14:00", endTime: "14:30", status: "confirmed", notes: null, price: 150000, serviceName: "Диагностика", serviceColor: "#8B5CF6", resourceName: "Доктор Иванова" },
  { id: "b9", serviceId: "s1", resourceId: "r2", clientName: "Федоров Роман", clientPhone: "+79990001122", clientEmail: null, date: mockDate(4), startTime: "16:00", endTime: "17:00", status: "cancelled", notes: "Перенос", price: 300000, serviceName: "Консультация", serviceColor: "#3B82F6", resourceName: "Доктор Иванова" },
  { id: "b10", serviceId: "s3", resourceId: "r1", clientName: "Данилова Екатерина", clientPhone: "+79991234567", clientEmail: null, date: mockDate(5), startTime: "11:00", endTime: "12:30", status: "confirmed", notes: null, price: 500000, serviceName: "Процедура", serviceColor: "#10B981", resourceName: "Кабинет 1" },
]

// ─── Status icons ─────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, typeof Check> = {
  confirmed: Check,
  completed: CheckCheck,
  cancelled: X,
  no_show: UserX,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookingCalendarPage() {
  const [bookingsList, setBookingsList] = useState<BookingItem[]>(MOCK_BOOKINGS)
  const [weekStart, setWeekStart] = useState(monday)
  const [viewMode, setViewMode] = useState<"week" | "day">("week")
  const [selectedDay, setSelectedDay] = useState(today)
  const [filterResource, setFilterResource] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [preDate, setPreDate] = useState("")
  const [preTime, setPreTime] = useState("")
  const [detailBooking, setDetailBooking] = useState<BookingItem | null>(null)

  // Week days
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [weekStart])

  const navPrev = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  const navNext = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }
  const navToday = () => {
    setWeekStart(getMonday(new Date()))
    setSelectedDay(new Date())
  }

  // Filter
  const filtered = filterResource === "all"
    ? bookingsList
    : bookingsList.filter((b) => b.resourceId === filterResource)

  // Summary
  const todayStr = dateStr(new Date())
  const todayCount = bookingsList.filter((b) => b.date === todayStr && b.status === "confirmed").length
  const weekCount = bookingsList.filter((b) => {
    const d = b.date
    return d >= dateStr(weekDays[0]) && d <= dateStr(weekDays[6]) && b.status === "confirmed"
  }).length
  const monthRevenue = bookingsList
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + (b.price || 0), 0)
  const cancelPct = bookingsList.length > 0
    ? Math.round((bookingsList.filter((b) => b.status === "cancelled").length / bookingsList.length) * 100)
    : 0

  // Time slots (09:00 — 18:00, step 30 min)
  const timeSlots = useMemo(() => {
    const slots: string[] = []
    for (let h = 9; h < 18; h++) {
      slots.push(`${String(h).padStart(2, "0")}:00`)
      slots.push(`${String(h).padStart(2, "0")}:30`)
    }
    return slots
  }, [])

  const slotClickCreate = (day: Date, time: string) => {
    setPreDate(dateStr(day))
    setPreTime(time)
    setCreateOpen(true)
  }

  const handleCreate = (data: {
    serviceId: string; resourceId: string; date: string
    startTime: string; endTime: string; clientName: string
    clientPhone: string; clientEmail: string; notes: string; price: number | null
  }) => {
    const service = MOCK_SERVICES.find((s) => s.id === data.serviceId)
    const resource = MOCK_RESOURCES.find((r) => r.id === data.resourceId)
    const newB: BookingItem = {
      id: String(Date.now()),
      serviceId: data.serviceId,
      resourceId: data.resourceId || null,
      clientName: data.clientName,
      clientPhone: data.clientPhone || null,
      clientEmail: data.clientEmail || null,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      status: "confirmed",
      notes: data.notes || null,
      price: data.price,
      serviceName: service?.name || "",
      serviceColor: service?.color || "#3B82F6",
      resourceName: resource?.name || null,
    }
    setBookingsList((prev) => [...prev, newB])
    setCreateOpen(false)
    toast.success("Запись создана")
  }

  const updateStatus = (id: string, status: string) => {
    setBookingsList((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)))
    setDetailBooking(null)
    const label = BOOKING_STATUSES.find((s) => s.id === status)?.label
    toast.success(`Статус: ${label}`)
  }

  // Get bookings for a day in the visible columns
  const getDayBookings = (day: Date) =>
    filtered.filter((b) => b.date === dateStr(day) && b.status !== "cancelled")

  const summaryCards = [
    { label: "Сегодня", value: todayCount, bg: "bg-blue-500", Icon: TrendingUp },
    { label: "На неделе", value: weekCount, bg: "bg-purple-500", Icon: CalendarDays },
    { label: "Выручка", value: monthRevenue, isAmount: true, bg: "bg-emerald-500", Icon: DollarSign },
    { label: "Отмены", value: cancelPct, suffix: "%", bg: "bg-orange-500", Icon: XCircle },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUpFadeIn {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .dash-card-enter { opacity: 0; animation: slideUpFadeIn 500ms ease-out forwards; }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Календарь записей</h1>
                <p className="text-sm text-muted-foreground mt-1">Управление расписанием и бронированием</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={() => { setPreDate(""); setPreTime(""); setCreateOpen(true) }}>
                <Plus className="w-4 h-4" />
                Новая запись
              </Button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {summaryCards.map((c, i) => (
                <div
                  key={c.label}
                  className={`dash-card-enter rounded-xl shadow-sm p-5 text-white ${c.bg} hover:scale-[1.02] hover:shadow-lg transition-all duration-300 cursor-default`}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-white/90">{c.label}</span>
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <c.Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-white tabular-nums">
                    {"isAmount" in c && c.isAmount ? <CountUpMoney value={c.value} /> : <CountUp value={c.value} />}
                    {c.suffix ?? ""}
                  </p>
                </div>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={navPrev}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" className="h-9" onClick={navToday}>Сегодня</Button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={navNext}><ChevronRight className="w-4 h-4" /></Button>
                <span className="text-sm font-medium ml-2">
                  {weekDays[0].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} — {weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select value={filterResource} onValueChange={setFilterResource}>
                  <SelectTrigger className="w-[180px] h-9 rounded-xl"><SelectValue placeholder="Все ресурсы" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все ресурсы</SelectItem>
                    {MOCK_RESOURCES.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              {/* Header row */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
                <div className="p-2 text-xs text-muted-foreground" />
                {weekDays.map((day, i) => {
                  const isToday = dateStr(day) === todayStr
                  return (
                    <div
                      key={i}
                      className={`p-2 text-center border-l border-border ${isToday ? "bg-primary/5" : ""}`}
                    >
                      <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {DAY_NAMES[i]}
                      </div>
                      <div className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                        {day.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Time rows */}
              <div className="relative" style={{ height: timeSlots.length * 40 }}>
                {/* Time labels + horizontal lines */}
                {timeSlots.map((slot, i) => (
                  <div
                    key={slot}
                    className="absolute left-0 right-0 border-b border-border/50"
                    style={{ top: i * 40, height: 40 }}
                  >
                    <div className="w-[60px] text-[11px] text-muted-foreground text-right pr-2 pt-1">
                      {slot.endsWith(":00") ? slot : ""}
                    </div>
                  </div>
                ))}

                {/* Day columns (clickable) */}
                {weekDays.map((day, dayIdx) => {
                  const isToday = dateStr(day) === todayStr
                  const dayBookings = getDayBookings(day)

                  return (
                    <div
                      key={dayIdx}
                      className={`absolute top-0 bottom-0 border-l border-border ${isToday ? "bg-primary/[0.02]" : ""}`}
                      style={{
                        left: `calc(60px + ${dayIdx} * ((100% - 60px) / 7))`,
                        width: `calc((100% - 60px) / 7)`,
                      }}
                    >
                      {/* Clickable slots */}
                      {timeSlots.map((slot, slotIdx) => (
                        <div
                          key={slot}
                          className="absolute left-0 right-0 cursor-pointer hover:bg-primary/5 transition-colors"
                          style={{ top: slotIdx * 40, height: 40 }}
                          onClick={() => slotClickCreate(day, slot)}
                        />
                      ))}

                      {/* Booking blocks */}
                      {dayBookings.map((b) => {
                        const startMin = timeToMinutes(b.startTime) - 9 * 60
                        const endMin = timeToMinutes(b.endTime) - 9 * 60
                        const top = (startMin / 30) * 40
                        const height = ((endMin - startMin) / 30) * 40

                        return (
                          <div
                            key={b.id}
                            className="absolute left-1 right-1 rounded-lg px-2 py-1 cursor-pointer hover:shadow-md transition-shadow overflow-hidden z-10"
                            style={{
                              top,
                              height: Math.max(height, 24),
                              backgroundColor: `${b.serviceColor}20`,
                              borderLeft: `3px solid ${b.serviceColor}`,
                            }}
                            onClick={(e) => { e.stopPropagation(); setDetailBooking(b) }}
                          >
                            <div className="text-[11px] font-semibold truncate" style={{ color: b.serviceColor }}>{b.startTime} – {b.endTime}</div>
                            {height >= 48 && <div className="text-[11px] font-medium truncate">{b.serviceName}</div>}
                            {height >= 68 && <div className="text-[10px] text-muted-foreground truncate">{b.clientName}</div>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Create Modal */}
      <BookingCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        services={MOCK_SERVICES}
        resources={MOCK_RESOURCES}
        preselectedDate={preDate}
        preselectedTime={preTime}
      />

      {/* Detail Modal */}
      <Dialog open={!!detailBooking} onOpenChange={() => setDetailBooking(null)}>
        <DialogContent className="sm:max-w-md">
          {detailBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: detailBooking.serviceColor }} />
                  {detailBooking.serviceName}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Клиент</span>
                    <p className="font-medium">{detailBooking.clientName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Телефон</span>
                    <p className="font-medium">{detailBooking.clientPhone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Дата</span>
                    <p className="font-medium">{new Date(detailBooking.date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Время</span>
                    <p className="font-medium">{detailBooking.startTime} – {detailBooking.endTime}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ресурс</span>
                    <p className="font-medium">{detailBooking.resourceName || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Статус</span>
                    <Badge
                      className="text-xs text-white"
                      style={{ backgroundColor: BOOKING_STATUSES.find((s) => s.id === detailBooking.status)?.color }}
                    >
                      {BOOKING_STATUSES.find((s) => s.id === detailBooking.status)?.label}
                    </Badge>
                  </div>
                </div>
                {detailBooking.notes && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Заметки:</span>
                    <p className="mt-0.5">{detailBooking.notes}</p>
                  </div>
                )}
                {detailBooking.status === "confirmed" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1 gap-1.5 bg-emerald-500 hover:bg-emerald-600" onClick={() => updateStatus(detailBooking.id, "completed")}>
                      <CheckCheck className="w-4 h-4" />
                      Завершить
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-destructive" onClick={() => updateStatus(detailBooking.id, "cancelled")}>
                      <X className="w-4 h-4" />
                      Отменить
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => updateStatus(detailBooking.id, "no_show")}>
                      <UserX className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
