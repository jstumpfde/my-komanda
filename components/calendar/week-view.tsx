"use client"

import { useMemo } from "react"
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  addHours,
  startOfDay,
  differenceInMinutes,
  isSameDay,
  isToday,
  isWeekend,
} from "date-fns"
import { ru } from "date-fns/locale"

export interface CalendarEvent {
  id: string
  title: string
  type: string
  startAt: string
  endAt: string
  color?: string | null
  roomId?: string | null
}

const TYPE_COLORS: Record<string, string> = {
  interview: "bg-blue-500 text-white",
  meeting: "bg-green-500 text-white",
  training: "bg-purple-500 text-white",
  booking: "bg-orange-500 text-white",
  other: "bg-gray-500 text-white",
}

const HOURS_START = 8
const HOURS_END = 20
const TOTAL_HOURS = HOURS_END - HOURS_START
const SLOT_HEIGHT = 60 // px per hour

interface WeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onSlotClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function WeekView({ currentDate, events, onSlotClick, onEventClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { locale: ru, weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { locale: ru, weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const hours = useMemo(
    () => Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i),
    []
  )

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.startAt), day))

  const getEventStyle = (event: CalendarEvent) => {
    const start = new Date(event.startAt)
    const end = new Date(event.endAt)
    const dayStart = addHours(startOfDay(start), HOURS_START)
    const minutesFromStart = Math.max(0, differenceInMinutes(start, dayStart))
    const duration = Math.max(30, differenceInMinutes(end, start))
    const top = (minutesFromStart / 60) * SLOT_HEIGHT
    const height = (duration / 60) * SLOT_HEIGHT
    return { top, height }
  }

  return (
    <div className="flex flex-col h-full overflow-auto border rounded-xl">
      {/* Header row */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b sticky top-0 bg-card z-10 rounded-t-xl">
        <div />
        {days.map((day) => {
          const today = isToday(day)
          const weekend = isWeekend(day)
          return (
            <div key={day.toISOString()} className="border-l py-2.5 flex items-center justify-center gap-1.5">
              <span className={`text-xs uppercase ${weekend ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                {format(day, "EEEEEE", { locale: ru })}
              </span>
              <span className={`text-sm font-semibold min-w-6 h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-primary-foreground" : weekend ? "text-muted-foreground/50" : "text-foreground"}`}>
                {format(day, "d")}
              </span>
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)] flex-1">
        {/* Time column */}
        <div>
          {hours.map((h) => (
            <div key={h} style={{ height: SLOT_HEIGHT }} className="border-b flex items-start justify-end pr-2 pt-1.5">
              <span className="text-[11px] text-muted-foreground/60 font-medium select-none">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const dayEvents = getEventsForDay(day)
          const weekend = isWeekend(day)
          return (
            <div key={day.toISOString()} className={`border-l relative ${weekend ? "bg-muted/20" : ""}`}>
              {/* Hour slots (clickable) */}
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ height: SLOT_HEIGHT }}
                  className="border-b border-border/50 cursor-pointer hover:bg-primary/5 transition-colors"
                  onClick={() => onSlotClick(addHours(startOfDay(day), h))}
                />
              ))}

              {/* Events */}
              {dayEvents.map((event) => {
                const { top, height } = getEventStyle(event)
                const colorClass = TYPE_COLORS[event.type] ?? TYPE_COLORS.other
                return (
                  <div
                    key={event.id}
                    className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs cursor-pointer overflow-hidden z-10 ${colorClass}`}
                    style={{ top, height: Math.max(height, 20) }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(event)
                    }}
                  >
                    <div className="font-medium truncate">{event.title}</div>
                    <div className="opacity-80 truncate">
                      {format(new Date(event.startAt), "HH:mm")}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
