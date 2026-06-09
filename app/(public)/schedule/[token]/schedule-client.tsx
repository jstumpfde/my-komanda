"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Calendar, Clock, Video, Building2, Phone, CheckCircle2, Globe, Loader2 } from "lucide-react"
import type { SchedulePageData, MethodConfig } from "@/lib/schedule-interview-types"

// ─── Иконки по методу ─────────────────────────────────────────────────────────

function MethodIcon({ method, className }: { method: string; className?: string }) {
  if (method === "office")  return <Building2 className={className} />
  if (method === "phone")   return <Phone className={className} />
  return <Video className={className} />
}

// ─── Часовые пояса ────────────────────────────────────────────────────────────

const TIMEZONES = [
  { id: "Europe/Moscow",       label: "Москва (UTC+3)" },
  { id: "Europe/Kaliningrad",  label: "Калининград (UTC+2)" },
  { id: "Asia/Yekaterinburg",  label: "Екатеринбург (UTC+5)" },
  { id: "Asia/Novosibirsk",    label: "Новосибирск (UTC+7)" },
  { id: "Asia/Vladivostok",    label: "Владивосток (UTC+10)" },
]

// ─── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  token: string
  initialData: SchedulePageData | null
  initialError: string | null
}

export function ScheduleClientPage({ token, initialData, initialError }: Props) {
  const [data]                      = useState<SchedulePageData | null>(initialData)
  const [method, setMethod]         = useState<string>(initialData?.defaultMethod ?? "phone")
  const [timezone, setTimezone]     = useState<string>(initialData?.timezone ?? "Europe/Moscow")
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null)
  const [confirmed, setConfirmed]   = useState(false)
  const [confirmedSlot, setConfirmedSlot] = useState<{ date: string; time: string; label: string } | null>(null)
  const [booking, setBooking]       = useState(false)

  // ─── Error / no-data state ─────────────────────────────────────────────────

  if (initialError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <div className="text-center space-y-3">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold">{initialError ?? "Ссылка недействительна"}</p>
          <p className="text-sm text-muted-foreground">Обратитесь к HR-менеджеру для получения новой ссылки</p>
        </div>
      </div>
    )
  }

  const accentColor = data.brandPrimaryColor
  const bgColor     = data.brandBgColor

  const selectedMethod: MethodConfig | undefined = data.methods.find(m => m.method === method)

  // ─── Подтверждение ─────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!selectedSlot) return
    setBooking(true)

    const dayObj = data.days.find(d => d.date === selectedSlot.date)
    const slotLabel = dayObj ? `${dayObj.label} · ${selectedSlot.time}` : selectedSlot.time

    try {
      const res = await fetch(`/api/public/schedule/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date:   selectedSlot.date,
          time:   selectedSlot.time,
          method: method,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? "Не удалось забронировать время")
        return
      }

      setConfirmedSlot({ date: selectedSlot.date, time: selectedSlot.time, label: slotLabel })
      setConfirmed(true)
      toast.success("Встреча подтверждена!")
    } catch {
      toast.error("Ошибка соединения")
    } finally {
      setBooking(false)
    }
  }

  const handleReschedule = () => {
    setConfirmed(false)
    setConfirmedSlot(null)
    setSelectedSlot(null)
  }

  // ─── Экран подтверждения ───────────────────────────────────────────────────

  if (confirmed && confirmedSlot) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
        <div className="max-w-md w-full text-center space-y-5">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Встреча подтверждена!</h1>

          <Card className="text-left">
            <CardContent className="pt-5 pb-5 space-y-3">
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{confirmedSlot.label}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{TIMEZONES.find(t => t.id === timezone)?.label}</span>
              </div>

              {method === "phone" && (
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

              {(method === "zoom" || method === "telemost" || method === "meet") && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2.5">
                    <Video className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Онлайн-встреча</p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                        {selectedMethod?.label} — ссылка придёт в напоминании за 15 минут до встречи
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {method === "office" && (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-start gap-2.5">
                      <Building2 className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-purple-800 dark:text-purple-300">Встреча в офисе</p>
                        {data.officeAddress && (
                          <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">{data.officeAddress}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 text-left">
              Мы пришлём напоминание за 24 часа до встречи
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Добавить в календарь:</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.info("Google Calendar (скоро)")}>Google</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Яндекс Календарь (скоро)")}>Яндекс</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Скачать .ics (скоро)")}>.ics</Button>
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

  // ─── Главный экран — выбор времени ─────────────────────────────────────────

  const hasSlots = data.days.length > 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
      <div className="max-w-lg w-full space-y-6">
        {/* Logo / Company */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            {data.companyLogo ? (
              <img src={data.companyLogo} alt={data.companyName} className="w-10 h-10 rounded-xl object-contain" />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: accentColor }}
              >
                {data.companyName[0]}
              </div>
            )}
            <span className="text-xl font-bold text-foreground">{data.companyName}</span>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {data.candidateFirstName || data.candidateName}, выберите удобное время
          </h1>
          <p className="text-muted-foreground mt-1">для интервью на позицию «{data.vacancyTitle}»</p>
        </div>

        {/* Способ интервью */}
        {data.methods.length > 1 && (
          <div className={cn("grid gap-2", data.methods.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
            {data.methods.map(m => (
              <button
                key={m.method}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                  method === m.method
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
                onClick={() => setMethod(m.method)}
              >
                <MethodIcon
                  method={m.method}
                  className={cn("w-5 h-5", method === m.method ? "text-primary" : "text-muted-foreground")}
                />
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.duration} мин</span>
              </button>
            ))}
          </div>
        )}

        {/* Адрес офиса (если выбран office) */}
        {method === "office" && data.officeAddress && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-sm">
            <Building2 className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
            <span className="text-purple-800 dark:text-purple-300">{data.officeAddress}</span>
          </div>
        )}

        {/* Часовой пояс */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Globe className="w-4 h-4" /> Часовой пояс
          </div>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => (
                <SelectItem key={tz.id} value={tz.id}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Слоты */}
        {hasSlots ? (
          <Card className="border-none">
            <CardContent className="pt-5 pb-5 space-y-4">
              {data.days.map(day => (
                <div key={day.date}>
                  <p className="text-sm font-medium text-muted-foreground mb-2">{day.label}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {day.slots.map(time => {
                      const isSelected = selectedSlot?.date === day.date && selectedSlot?.time === time
                      return (
                        <button
                          key={time}
                          className={cn(
                            "py-3 rounded-lg border text-sm font-medium transition-all",
                            isSelected
                              ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                              : "border-border hover:border-primary/30 text-foreground"
                          )}
                          onClick={() => setSelectedSlot({ date: day.date, time })}
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
        ) : (
          <Card className="border-none">
            <CardContent className="pt-8 pb-8 text-center">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Нет доступных слотов</p>
              <p className="text-xs text-muted-foreground mt-1">
                Обратитесь к HR-менеджеру для согласования времени
              </p>
            </CardContent>
          </Card>
        )}

        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold text-white rounded-xl"
          style={{ backgroundColor: accentColor }}
          disabled={!selectedSlot || booking}
          onClick={handleConfirm}
        >
          {booking ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Бронируем...</>
          ) : (
            <><Calendar className="w-5 h-5 mr-2" /> Подтвердить время</>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground/50">Powered by Company24</p>
      </div>
    </div>
  )
}
