"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Calendar, Clock, Video, Building2, Phone, CheckCircle2, Globe, Loader2, ExternalLink, Download } from "lucide-react"
import type { SchedulePageData, MethodConfig, BookingResponse } from "@/lib/schedule-interview-types"

// ─── Иконки по методу ─────────────────────────────────────────────────────────

function MethodIcon({ method, className }: { method: string; className?: string }) {
  if (method === "office")  return <Building2 className={className} />
  if (method === "phone")   return <Phone className={className} />
  return <Video className={className} />
}

// ─── Календарные ссылки / .ics ─────────────────────────────────────────────────

function toGoogleUtc(iso: string): string {
  // "2026-07-03T12:00:00.000Z" → "20260703T120000Z"
  return iso.replace(/[-:]/g, "").split(".")[0] + "Z"
}

function buildGoogleCalendarUrl(opts: { title: string; startAt: string; endAt: string; details: string; location: string }): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${toGoogleUtc(opts.startAt)}/${toGoogleUtc(opts.endAt)}`,
    details: opts.details,
    location: opts.location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function buildYandexCalendarUrl(opts: { title: string; startAt: string; endAt: string; description: string }): string {
  const params = new URLSearchParams({
    name: opts.title,
    startTs: String(Math.floor(new Date(opts.startAt).getTime() / 1000)),
    endTs: String(Math.floor(new Date(opts.endAt).getTime() / 1000)),
    description: opts.description,
  })
  return `https://calendar.yandex.ru/event?${params.toString()}`
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

function downloadIcs(opts: { title: string; startAt: string; endAt: string; description: string }) {
  const dtStart = toGoogleUtc(opts.startAt)
  const dtEnd   = toGoogleUtc(opts.endAt)
  const dtStamp = toGoogleUtc(new Date().toISOString())
  const uid = `${dtStamp}-${Math.random().toString(36).slice(2)}@company24.pro`

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Company24//Schedule//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url
  a.download = "interview.ics"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  token: string
  initialData: SchedulePageData | null
  initialError: string | null
}

export function ScheduleClientPage({ token, initialData, initialError }: Props) {
  const [data]                      = useState<SchedulePageData | null>(initialData)
  // Способ встречи задан вакансией/настройками — кандидат его НЕ выбирает.
  const method = initialData?.defaultMethod ?? "phone"
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null)
  const [confirmed, setConfirmed]   = useState(false)
  const [booking, setBooking]       = useState<BookingResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ─── Error / no-data state ─────────────────────────────────────────────────

  if (initialError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center space-y-3">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold">{initialError ?? "Ссылка недействительна"}</p>
          <p className="text-sm text-muted-foreground">Обратитесь к HR-менеджеру для получения новой ссылки</p>
        </div>
      </div>
    )
  }

  const accentColor = data.brandPrimaryColor

  const selectedMethod: MethodConfig | undefined = data.methods.find(m => m.method === method)

  // ─── Подтверждение ─────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!selectedSlot) return
    setSubmitting(true)

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

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(json.error ?? "Не удалось забронировать время")
        return
      }

      setBooking(json as BookingResponse)
      setConfirmed(true)
      toast.success("Встреча подтверждена!")
    } catch {
      toast.error("Ошибка соединения")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReschedule = () => {
    setConfirmed(false)
    setBooking(null)
    setSelectedSlot(null)
  }

  // ─── Экран подтверждения ───────────────────────────────────────────────────

  if (confirmed && booking) {
    const eventTitle = `Интервью: ${booking.vacancyTitle}`
    const description = [
      `Способ: ${booking.methodLabel || (method === "office" ? "Офис" : method === "phone" ? "Телефон" : "Онлайн")}`,
      booking.location ? `Адрес: ${booking.location}` : null,
      `Вакансия: ${booking.vacancyTitle}`,
    ].filter(Boolean).join("\n")

    const googleUrl = buildGoogleCalendarUrl({
      title: eventTitle, startAt: booking.startAt, endAt: booking.endAt,
      details: description, location: booking.location ?? "",
    })
    const yandexUrl = buildYandexCalendarUrl({
      title: eventTitle, startAt: booking.startAt, endAt: booking.endAt, description,
    })

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border shadow-sm p-6">
            {/* Logo / Company — внутри белой карточки (Юрий 04.07) */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b justify-center">
              {data.companyLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.companyLogo} alt={data.companyName} className="w-12 h-12 rounded-xl object-contain bg-white border p-1" />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: accentColor }}
                >
                  {data.companyName[0]}
                </div>
              )}
              <p className="font-semibold text-slate-900">{data.companyName}</p>
            </div>
            <div className="text-center mb-5">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <h1 className="text-xl font-bold text-slate-900">{booking.bookedTitle}</h1>
              <p className="text-sm text-slate-500 mt-1.5">{booking.bookedText}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3 text-left">
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-900">
                  {formatDayLabel(booking.startAt, booking.timezone)} · {formatTimeLabel(booking.startAt, booking.timezone)}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-700">Время указано в часовом поясе {data.timezoneLabel}</span>
              </div>

              {method === "phone" && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-start gap-2.5">
                    <Phone className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800">Звонок по телефону</p>
                      <p className="text-xs text-emerald-700 mt-0.5">Мы позвоним вам на указанный номер в назначенное время</p>
                    </div>
                  </div>
                </div>
              )}

              {(method === "zoom" || method === "telemost" || method === "meet") && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-2.5">
                    <Video className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Онлайн-встреча</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        {selectedMethod?.label || booking.methodLabel} — ссылка придёт в напоминании за 15 минут до встречи
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {method === "office" && (
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-purple-800">Встреча в офисе</p>
                      {(booking.location || data.officeAddress) && (
                        <p className="text-xs text-purple-700 mt-0.5">{booking.location ?? data.officeAddress}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 p-3 mt-3 rounded-lg bg-amber-50 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 text-left">
                Мы пришлём напоминания: за сутки, утром в день встречи и за час до неё
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-medium text-slate-600 text-center sm:text-left">Добавить в календарь:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Google Calendar
                  </Button>
                </a>
                <a href={yandexUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Яндекс Календарь
                  </Button>
                </a>
                <Button
                  variant="outline" size="sm" className="flex-1"
                  onClick={() => downloadIcs({ title: eventTitle, startAt: booking.startAt, endAt: booking.endAt, description })}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" /> .ics
                </Button>
              </div>
            </div>

            <button
              className="w-full text-center text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800 mt-5"
              onClick={handleReschedule}
            >
              Перенести на другое время
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">Powered by Company24</p>
        </div>
      </div>
    )
  }

  // ─── Главный экран — выбор времени ─────────────────────────────────────────

  const hasSlots = data.days.length > 0

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl border shadow-sm p-6">
          {/* Logo / Company — внутри белой карточки (Юрий 04.07) */}
          <div className="flex items-center gap-3 mb-5 pb-4 border-b justify-center">
            {data.companyLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.companyLogo} alt={data.companyName} className="w-12 h-12 rounded-xl object-contain bg-white border p-1" />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                style={{ backgroundColor: accentColor }}
              >
                {data.companyName[0]}
              </div>
            )}
            <p className="font-semibold text-slate-900">{data.companyName}</p>
          </div>
          <div className="text-center mb-5">
            <h1 className="text-xl font-bold text-slate-900">
              {data.candidateFirstName || data.candidateName}, выберите удобное время
            </h1>
            <p className="text-slate-500 text-sm mt-1">для интервью на позицию «{data.vacancyTitle}»</p>
          </div>

          {/* Способ встречи — показываем ТОЛЬКО актуальный (кандидат не выбирает) */}
          {selectedMethod && (
            <div className={cn(
              "flex items-center gap-3 p-3.5 rounded-xl border text-sm mb-4",
              method === "office"
                ? "bg-purple-50 border-purple-200"
                : method === "phone"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-blue-50 border-blue-200"
            )}>
              <MethodIcon
                method={method}
                className={cn(
                  "w-5 h-5 shrink-0",
                  method === "office" ? "text-purple-600" : method === "phone" ? "text-emerald-600" : "text-blue-600"
                )}
              />
              <div className="min-w-0">
                <p className={cn(
                  "font-medium",
                  method === "office" ? "text-purple-900"
                    : method === "phone" ? "text-emerald-900"
                      : "text-blue-900"
                )}>
                  {method === "office" ? "Встреча в офисе"
                    : method === "phone" ? "Телефонное интервью"
                      : selectedMethod.label
                        ? `Онлайн-интервью — ${selectedMethod.label}`
                        : "Онлайн-интервью"}
                </p>
                {/* Для офиса сразу показываем адрес + метро */}
                {method === "office" && data.officeAddress && (
                  <p className="text-purple-700 mt-0.5">{data.officeAddress}</p>
                )}
                {method !== "office" && (
                  <p className={cn(
                    "mt-0.5",
                    method === "phone" ? "text-emerald-700" : "text-blue-700"
                  )}>
                    Длительность — {selectedMethod.duration} мин
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Часовой пояс — только информация, кандидат его не меняет */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500 justify-center mb-4">
            <Globe className="w-4 h-4 shrink-0" />
            <span>Время указано в часовом поясе {data.timezoneLabel}</span>
          </div>

          {/* Слоты */}
          {hasSlots ? (
            <div className="space-y-4">
              {data.days.map(day => (
                <div key={day.date}>
                  <p className="text-sm font-semibold text-slate-700 mb-2">{day.label}</p>
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
                              : "border-slate-200 hover:border-primary/30 text-slate-900"
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
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-900">Нет доступных слотов</p>
              <p className="text-xs text-slate-500 mt-1">
                Обратитесь к HR-менеджеру для согласования времени
              </p>
            </div>
          )}

          <Button
            size="lg"
            className="w-full h-12 text-base font-semibold text-white rounded-xl mt-5"
            style={{ backgroundColor: accentColor }}
            disabled={!selectedSlot || submitting}
            onClick={handleConfirm}
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Бронируем...</>
            ) : (
              <><Calendar className="w-5 h-5 mr-2" /> Подтвердить время</>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">Powered by Company24</p>
      </div>
    </div>
  )
}

// ─── Форматирование даты/времени (клиент, из ISO UTC + TZ) ───────────────────

const DAY_LABELS_RU  = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"]
const MONTH_SHORT_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"]

function formatDayLabel(iso: string, tz: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10)
  const month = get("month")
  const day   = get("day")
  const jsDay = new Date(Date.UTC(get("year"), month - 1, day)).getDay()
  return `${DAY_LABELS_RU[jsDay] ?? ""}, ${day} ${MONTH_SHORT_RU[month - 1] ?? ""}`
}

function formatTimeLabel(iso: string, tz: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  return fmt.format(d)
}
