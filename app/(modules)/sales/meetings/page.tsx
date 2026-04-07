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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, Plus, Phone, Users, Monitor, Presentation, Clock, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type MeetingType = "call" | "meeting" | "demo" | "presentation"
type MeetingStatus = "scheduled" | "done" | "cancelled"

interface Meeting {
  id: string
  type: MeetingType
  title: string
  date: string
  time: string
  duration: string
  participants: string[]
  deal: string
  status: MeetingStatus
  agenda: string
  isToday: boolean
}

const TYPE_CONFIG: Record<MeetingType, { label: string; icon: typeof Phone; color: string }> = {
  call: { label: "Звонок", icon: Phone, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  meeting: { label: "Встреча", icon: Users, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  demo: { label: "Демо", icon: Monitor, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  presentation: { label: "Презентация", icon: Presentation, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
}

const STATUS_CONFIG: Record<MeetingStatus, { label: string; color: string }> = {
  scheduled: { label: "Запланировано", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  done: { label: "Завершено", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelled: { label: "Отменено", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
}

const WEEK_DAYS = [
  { label: "Пн 25.03", key: "mon" },
  { label: "Вт 26.03", key: "tue" },
  { label: "Ср 27.03", key: "wed" },
  { label: "Чт 28.03", key: "thu" },
  { label: "Пт 29.03", key: "fri", today: true },
  { label: "Сб 30.03", key: "sat" },
  { label: "Вс 31.03", key: "sun" },
]

const INITIAL_MEETINGS: Meeting[] = [
  {
    id: "1", type: "call", title: "Уточнение требований",
    date: "25.03", time: "10:00", duration: "30 мин",
    participants: ["Алексей Иванов", "Иван Смирнов"],
    deal: "ООО Техностар", status: "done",
    agenda: "Обсудить детали внедрения CRM",
    isToday: false,
  },
  {
    id: "2", type: "demo", title: "Демонстрация платформы",
    date: "26.03", time: "14:00", duration: "1 ч",
    participants: ["Мария Петрова", "Павел Орлов", "Роман Федоров"],
    deal: "ЗАО Капитал", status: "done",
    agenda: "Показать функционал модуля продаж",
    isToday: false,
  },
  {
    id: "3", type: "meeting", title: "Переговоры по контракту",
    date: "29.03", time: "11:00", duration: "1.5 ч",
    participants: ["Алексей Иванов", "Роман Федоров"],
    deal: "ЗАО Капитал", status: "scheduled",
    agenda: "Согласование условий и скидок",
    isToday: true,
  },
  {
    id: "4", type: "call", title: "Follow-up после КП",
    date: "29.03", time: "15:30", duration: "20 мин",
    participants: ["Мария Петрова", "Михаил Волков"],
    deal: "АО Альфа Ресурс", status: "scheduled",
    agenda: "Получить обратную связь по коммерческому предложению",
    isToday: true,
  },
  {
    id: "5", type: "presentation", title: "Финальная презентация",
    date: "31.03", time: "10:00", duration: "2 ч",
    participants: ["Алексей Иванов", "Мария Петрова", "Дмитрий Козлов"],
    deal: "ГК Вектор", status: "scheduled",
    agenda: "Финальное согласование проекта с топ-менеджментом",
    isToday: false,
  },
  {
    id: "6", type: "meeting", title: "Знакомство с командой",
    date: "01.04", time: "13:00", duration: "45 мин",
    participants: ["Сергей Новиков", "Елена Тихонова"],
    deal: "ООО СтройГрупп", status: "scheduled",
    agenda: "Первичные переговоры о сотрудничестве",
    isToday: false,
  },
]

const DEALS = ["ООО Техностар", "ГК Вектор", "ЗАО Капитал", "ООО Горизонт", "АО Альфа Ресурс", "ООО СтройГрупп"]
const MANAGERS = ["Алексей Иванов", "Мария Петрова", "Дмитрий Козлов", "Сергей Новиков"]

export default function SalesMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>(INITIAL_MEETINGS)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)

  const [form, setForm] = useState({
    type: "call" as MeetingType,
    title: "",
    date: "",
    time: "",
    duration: "30 мин",
    participants: "",
    deal: "",
    agenda: "",
  })

  const todayMeetings = meetings.filter(m => m.isToday)
  const upcomingMeetings = meetings.filter(m => !m.isToday && m.status === "scheduled")
  const pastMeetings = meetings.filter(m => m.status === "done")

  const handleCreate = () => {
    if (!form.title) { toast.error("Введите название встречи"); return }
    const newMeeting: Meeting = {
      id: String(Date.now()),
      type: form.type,
      title: form.title,
      date: form.date || "—",
      time: form.time || "—",
      duration: form.duration,
      participants: form.participants ? form.participants.split(",").map(p => p.trim()) : [],
      deal: form.deal || "—",
      status: "scheduled",
      agenda: form.agenda,
      isToday: false,
    }
    setMeetings(prev => [...prev, newMeeting])
    setSheetOpen(false)
    setForm({ type: "call", title: "", date: "", time: "", duration: "30 мин", participants: "", deal: "", agenda: "" })
    toast.success("Встреча запланирована")
  }

  function MeetingCard({ meeting }: { meeting: Meeting }) {
    const typeConfig = TYPE_CONFIG[meeting.type]
    const TypeIcon = typeConfig.icon
    return (
      <div
        className={cn(
          "border rounded-xl p-4 bg-card cursor-pointer",
          meeting.isToday && "border-primary/50 bg-primary/5"
        )}
        onClick={() => setSelectedMeeting(meeting)}
      >
        <div className="flex items-start gap-3 mb-2">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", typeConfig.color)}>
            <TypeIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{meeting.title}</p>
              {meeting.isToday && <Badge className="text-[10px] border-0 bg-primary/10 text-primary py-0">Сегодня</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{meeting.deal}</p>
          </div>
          <Badge className={cn("text-xs border-0 shrink-0", STATUS_CONFIG[meeting.status].color)}>
            {STATUS_CONFIG[meeting.status].label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {meeting.date} {meeting.time}
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {meeting.duration}
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {meeting.participants.length} участников
          </div>
        </div>
        {meeting.participants.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            {meeting.participants.slice(0, 3).map((p, i) => (
              <Avatar key={i} className="w-5 h-5">
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                  {p.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            ))}
            {meeting.participants.length > 3 && (
              <span className="text-xs text-muted-foreground">+{meeting.participants.length - 3}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Встречи</h1>
                  <p className="text-sm text-muted-foreground">Неделя 25–31 марта 2026</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                <Plus className="w-4 h-4" />
                Запланировать
              </Button>
            </div>

            {/* Week mini-calendar */}
            <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
              {WEEK_DAYS.map((day) => {
                const count = meetings.filter(m => m.date.startsWith(day.label.split(" ")[1]?.split(".").reverse().join(".").slice(0, 5) || "")).length
                return (
                  <div key={day.key} className={cn(
                    "flex-1 min-w-[68px] text-center p-2 rounded-xl border text-xs transition-colors",
                    day.today ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border"
                  )}>
                    <p className="font-medium">{day.label.split(" ")[0]}</p>
                    <p className={cn("text-[10px]", day.today ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {day.label.split(" ")[1]}
                    </p>
                    {count > 0 && (
                      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center mx-auto mt-1 text-[9px] font-bold",
                        day.today ? "bg-white text-primary" : "bg-primary text-white"
                      )}>
                        {count}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Today's meetings */}
            {todayMeetings.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Сегодня · {todayMeetings.length} встречи
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {todayMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
                </div>
              </div>
            )}

            {/* Upcoming */}
            {upcomingMeetings.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-3">Предстоящие</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {upcomingMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
                </div>
              </div>
            )}

            {/* Past */}
            {pastMeetings.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Прошедшие</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-70">
                  {pastMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
                </div>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Schedule Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Запланировать встречу
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as MeetingType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Звонок</SelectItem>
                  <SelectItem value="meeting">Встреча</SelectItem>
                  <SelectItem value="demo">Демо</SelectItem>
                  <SelectItem value="presentation">Презентация</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input placeholder="Обсуждение КП" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Дата</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Время</Label>
                <Input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Длительность</Label>
              <Select value={form.duration} onValueChange={v => setForm(p => ({ ...p, duration: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15 мин", "30 мин", "45 мин", "1 ч", "1.5 ч", "2 ч"].map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Участники (через запятую)</Label>
              <Input placeholder="Алексей Иванов, Иван Смирнов" value={form.participants} onChange={e => setForm(p => ({ ...p, participants: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Сделка / Клиент</Label>
              <Select value={form.deal} onValueChange={v => setForm(p => ({ ...p, deal: v }))}>
                <SelectTrigger><SelectValue placeholder="Без привязки" /></SelectTrigger>
                <SelectContent>
                  {DEALS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Повестка</Label>
              <Textarea placeholder="Цели и темы встречи..." value={form.agenda} onChange={e => setForm(p => ({ ...p, agenda: e.target.value }))} rows={2} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate}>Запланировать</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Meeting Detail Sheet */}
      <Sheet open={!!selectedMeeting} onOpenChange={open => { if (!open) setSelectedMeeting(null) }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedMeeting && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", TYPE_CONFIG[selectedMeeting.type].color)}>
                    {(() => { const Icon = TYPE_CONFIG[selectedMeeting.type].icon; return <Icon className="w-5 h-5" /> })()}
                  </div>
                  <div>
                    <SheetTitle>{selectedMeeting.title}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{TYPE_CONFIG[selectedMeeting.type].label}</p>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-4">
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{selectedMeeting.date} в {selectedMeeting.time} · {selectedMeeting.duration}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="w-4 h-4" />
                    <span>{selectedMeeting.deal}</span>
                  </div>
                </div>

                {selectedMeeting.agenda && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">ПОВЕСТКА</p>
                    <p className="text-sm text-foreground">{selectedMeeting.agenda}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">УЧАСТНИКИ</p>
                  <div className="space-y-1.5">
                    {selectedMeeting.participants.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {p.split(" ").map(w => w[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-foreground">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}

function Briefcase({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 20H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
