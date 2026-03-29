"use client"

import { useState } from "react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns"
import { ru } from "date-fns/locale"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { CalendarEvent } from "./week-view"

const TYPE_BG: Record<string, string> = {
  interview: "bg-blue-500",
  meeting: "bg-green-500",
  training: "bg-purple-500",
  booking: "bg-orange-500",
  other: "bg-gray-400",
}

interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
}

export function MonthView({ currentDate, events, onEventClick }: MonthViewProps) {
  const [openDayKey, setOpenDayKey] = useState<string | null>(null)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.startAt), day))

  return (
    <div className="flex flex-col h-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b">
        {weekdays.map((wd) => (
          <div key={wd} className="py-2 text-center text-xs font-medium text-muted-foreground border-l first:border-l-0">
            {wd}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 flex-1 overflow-auto">
        {days.map((day) => {
          const dayKey = day.toISOString()
          const dayEvents = getEventsForDay(day)
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)

          return (
            <Popover
              key={dayKey}
              open={openDayKey === dayKey}
              onOpenChange={(open) => setOpenDayKey(open ? dayKey : null)}
            >
              <PopoverTrigger asChild>
                <div
                  className={`min-h-[80px] border-b border-l first:border-l-0 p-1 cursor-pointer hover:bg-muted/30 transition-colors ${
                    !inMonth ? "bg-muted/10" : ""
                  }`}
                  onClick={() => dayEvents.length > 0 && setOpenDayKey(dayKey)}
                >
                  <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                    today ? "bg-violet-600 text-white" : inMonth ? "" : "text-muted-foreground"
                  }`}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={`w-full rounded px-1 text-[10px] text-white truncate ${TYPE_BG[event.type] ?? TYPE_BG.other}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick(event)
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayEvents.length - 3} ещё
                      </div>
                    )}
                  </div>
                </div>
              </PopoverTrigger>
              {dayEvents.length > 0 && (
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="font-semibold text-sm mb-2">
                    {format(day, "d MMMM", { locale: ru })}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                        onClick={() => {
                          setOpenDayKey(null)
                          onEventClick(event)
                        }}
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_BG[event.type] ?? TYPE_BG.other}`} />
                        <div className="truncate flex-1">{event.title}</div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(event.startAt), "HH:mm")}
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              )}
            </Popover>
          )
        })}
      </div>
    </div>
  )
}
