"use client"

import { useMemo } from "react"
import {
  format,
  addHours,
  addMinutes,
  startOfDay,
  differenceInMinutes,
  isSameDay,
} from "date-fns"
import { ru } from "date-fns/locale"
import type { CalendarEvent } from "./week-view"

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
const SLOT_HEIGHT = 60 // px per hour (30-min slots = 30px each)

interface DayViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onSlotClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function DayView({ currentDate, events, onSlotClick, onEventClick }: DayViewProps) {
  const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), currentDate))

  // 30-min slots
  const slots = useMemo(
    () =>
      Array.from({ length: TOTAL_HOURS * 2 }, (_, i) => {
        const totalMinutes = HOURS_START * 60 + i * 30
        return addMinutes(startOfDay(currentDate), totalMinutes)
      }),
    [currentDate]
  )

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
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="border-b p-3 sticky top-0 bg-white z-10">
        <div className="text-lg font-semibold capitalize">
          {format(currentDate, "EEEE, d MMMM yyyy", { locale: ru })}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[60px_1fr] flex-1 relative">
        {/* Time column */}
        <div>
          {slots.map((slot, i) => (
            <div
              key={i}
              style={{ height: SLOT_HEIGHT / 2 }}
              className="border-b flex items-start"
            >
              {i % 2 === 0 && (
                <span className="text-xs text-muted-foreground px-1 pt-1 select-none">
                  {format(slot, "HH:mm")}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Events column */}
        <div className="border-l relative">
          {slots.map((slot, i) => (
            <div
              key={i}
              style={{ height: SLOT_HEIGHT / 2 }}
              className={`border-b cursor-pointer hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "border-dashed"}`}
              onClick={() => onSlotClick(slot)}
            />
          ))}

          {/* Events */}
          {dayEvents.map((event) => {
            const { top, height } = getEventStyle(event)
            const colorClass = TYPE_COLORS[event.type] ?? TYPE_COLORS.other
            return (
              <div
                key={event.id}
                className={`absolute left-1 right-1 rounded px-2 py-1 text-xs cursor-pointer overflow-hidden z-10 ${colorClass}`}
                style={{ top, height: Math.max(height, 24) }}
                onClick={(e) => {
                  e.stopPropagation()
                  onEventClick(event)
                }}
              >
                <div className="font-medium truncate">{event.title}</div>
                <div className="opacity-80">
                  {format(new Date(event.startAt), "HH:mm")} –{" "}
                  {format(new Date(event.endAt), "HH:mm")}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
