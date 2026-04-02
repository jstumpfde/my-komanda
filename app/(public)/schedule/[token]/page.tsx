"use client"

import { useState, use } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Calendar, Clock, Video, Building2, Phone, CheckCircle2, Globe, ExternalLink } from "lucide-react"
import { getBrand, brandCssVars, type BrandConfig } from "@/lib/branding"

const MEETING_TYPES = [
  { id: "online", label: "Онлайн", icon: Video, desc: "Яндекс Телемост" },
  { id: "office", label: "Офис", icon: Building2, desc: "ул. Тверская, 1" },
  { id: "phone", label: "Телефон", icon: Phone, desc: "Мы позвоним" },
]

const TIMEZONES = [
  { id: "Europe/Moscow", label: "Москва (UTC+3)" },
  { id: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { id: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { id: "Asia/Novosibirsk", label: "Новосибирск (UTC+7)" },
  { id: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
]

export default function SchedulePublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [meetingType, setMeetingType] = useState("online")
  const [timezone, setTimezone] = useState("Europe/Moscow")
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [brand, setBrand] = useState<BrandConfig | null>(null)

  // Load brand
  useState(() => { if (typeof window !== "undefined") setBrand(getBrand()) })

  // Mock candidate
  const candidateName = "Иван"
  const hrName = "Анной"
  const companyName = brand?.companyName || "ООО Ромашка"
  const accentColor = brand?.primaryColor || "#3b82f6"
  const bgColor = brand?.bgColor || "#f0f4ff"
  const logoUrl = brand?.logoUrl

  const days = Array.from({ length: 3 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d })
  const slots = ["10:00", "11:30", "14:00", "16:00"]
  const formatDay = (d: Date) => {
    const wd = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    return `${wd[d.getDay()]}, ${d.getDate()} ${d.toLocaleDateString("ru-RU", { month: "short" })}`
  }

  const handleConfirm = () => {
    if (!selectedSlot) return
    setConfirmed(true)
    toast.success("Встреча подтверждена!")
  }

  const handleReschedule = () => {
    setConfirmed(false)
    setSelectedSlot(null)
  }

  if (confirmed) {
    const officeAddr = "г. Москва, ул. Тверская, д. 1, офис 301"
    const directions = "Метро «Тверская» или «Пушкинская», выход к ул. Тверской. Вход со двора, 3 этаж. На ресепшен скажите что на собеседование."

    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
        <div className="max-w-md w-full text-center space-y-5">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Встреча подтверждена!</h1>

          {/* Details card */}
          <Card className="text-left">
            <CardContent className="pt-5 pb-5 space-y-3">
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{selectedSlot}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{TIMEZONES.find(t => t.id === timezone)?.label}</span>
              </div>

              {/* Meeting type specific block */}
              {meetingType === "phone" && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-start gap-2.5">
                    <Phone className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Звонок по телефону</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Мы позвоним вам на указанный номер в назначенное время</p>
                    </div>
                  </div>
                </div>
              )}

              {meetingType === "online" && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2.5">
                    <Video className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Онлайн-встреча</p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Ссылка на Яндекс Телемост придёт в напоминании за 15 минут до встречи</p>
                    </div>
                  </div>
                </div>
              )}

              {meetingType === "office" && (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-start gap-2.5">
                      <Building2 className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-purple-800 dark:text-purple-300">Встреча в офисе</p>
                        <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">{officeAddr}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border text-left">
                    <p className="text-xs font-semibold text-foreground mb-1">Как добраться:</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{directions}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reminder */}
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 text-left">
              Мы пришлём напоминание за 24 часа до встречи
            </p>
          </div>

          {/* Add to calendar */}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Добавить в календарь:</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.info("Google Calendar (заглушка)")}>Google</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Яндекс Календарь (заглушка)")}>Яндекс</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Скачать .ics (заглушка)")}>.ics</Button>
            </div>
          </div>

          <button className="text-sm text-muted-foreground underline underline-offset-4" onClick={handleReschedule}>
            Перенести встречу
          </button>

          <p className="text-xs text-muted-foreground/50">Powered by Company24</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
      <div className="max-w-lg w-full space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="w-10 h-10 rounded-xl object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: accentColor }}>{companyName[0]}</div>
            )}
            <span className="text-xl font-bold text-foreground">{companyName}</span>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">{candidateName}, выберите удобное время</h1>
          <p className="text-muted-foreground mt-1">для встречи с {hrName}</p>
        </div>

        {/* Meeting type */}
        <div className="grid grid-cols-3 gap-2">
          {MEETING_TYPES.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                  meetingType === t.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                )}
                onClick={() => setMeetingType(t.id)}
              >
                <Icon className={cn("w-5 h-5", meetingType === t.id ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-[10px] text-muted-foreground">{t.desc}</span>
              </button>
            )
          })}
        </div>

        {/* Timezone */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Globe className="w-4 h-4" /> Часовой пояс
          </div>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => <SelectItem key={tz.id} value={tz.id}>{tz.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Slots */}
        <Card className="border-none shadow-lg">
          <CardContent className="pt-5 pb-5 space-y-4">
            {days.map(day => (
              <div key={day.toISOString()}>
                <p className="text-sm font-medium text-muted-foreground mb-2">{formatDay(day)}</p>
                <div className="grid grid-cols-4 gap-2">
                  {slots.map(time => {
                    const key = `${formatDay(day)} · ${time}`
                    return (
                      <button
                        key={key}
                        className={cn(
                          "py-3 rounded-lg border text-sm font-medium transition-all",
                          selectedSlot === key
                            ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                            : "border-border hover:border-primary/30 text-foreground"
                        )}
                        onClick={() => setSelectedSlot(key)}
                      >
                        {time}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold text-white rounded-xl"
          style={{ backgroundColor: accentColor }}
          disabled={!selectedSlot}
          onClick={handleConfirm}
        >
          <Calendar className="w-5 h-5 mr-2" /> Подтвердить время
        </Button>

        <p className="text-center text-xs text-muted-foreground/50">Powered by Company24</p>
      </div>
    </div>
  )
}
