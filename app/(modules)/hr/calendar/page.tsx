"use client"

import { useState, useEffect, useCallback } from "react"
import {
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  subDays,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns"
import { ru } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
} from "lucide-react"
import { WeekView } from "@/components/calendar/week-view"
import { DayView } from "@/components/calendar/day-view"
import { MonthView } from "@/components/calendar/month-view"
import { EventModal } from "@/components/calendar/event-modal"
import { RoomSidebar } from "@/components/calendar/room-sidebar"
import type { CalendarEvent } from "@/components/calendar/week-view"
import type { EventFormData } from "@/components/calendar/event-modal"

type ViewMode = "week" | "day" | "month"
type FilterMode = "all" | "mine" | "hr"

interface Room {
  id: string
  name: string
  capacity?: number | null
  floor?: string | null
  equipment?: string[] | null
  isActive?: boolean | null
}

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "Компания" },
  { value: "hr", label: "HR" },
  { value: "mine", label: "Мой" },
]

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [filter, setFilter] = useState<FilterMode>("all")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | null>(null)

  const getDateRange = useCallback(() => {
    if (viewMode === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }
    }
    if (viewMode === "day") {
      return { start: currentDate, end: currentDate }
    }
    // month
    const ms = startOfMonth(currentDate)
    const me = endOfMonth(currentDate)
    return {
      start: startOfWeek(ms, { weekStartsOn: 1 }),
      end: endOfWeek(me, { weekStartsOn: 1 }),
    }
  }, [viewMode, currentDate])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange()
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        filter,
      })
      const res = await fetch(`/api/modules/hr/calendar?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data)
      }
    } finally {
      setLoading(false)
    }
  }, [getDateRange, filter])

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/modules/hr/rooms")
    if (res.ok) {
      const data = await res.json()
      setRooms(data)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "week") {
      setCurrentDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)))
    } else if (viewMode === "day") {
      setCurrentDate((d) => (dir === 1 ? addDays(d, 1) : subDays(d, 1)))
    } else {
      setCurrentDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)))
    }
  }

  const getTitle = () => {
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
      const we = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(ws, "d MMM", { locale: ru })} — ${format(we, "d MMM yyyy", { locale: ru })}`
    }
    if (viewMode === "day") {
      return format(currentDate, "d MMMM yyyy", { locale: ru })
    }
    return format(currentDate, "LLLL yyyy", { locale: ru })
  }

  const openNewEvent = (date?: Date) => {
    setSelectedEvent(null)
    setDefaultDate(date ?? new Date())
    setModalOpen(true)
  }

  const openEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setDefaultDate(null)
    setModalOpen(true)
  }

  const handleSave = async (data: EventFormData) => {
    if (selectedEvent) {
      // Update
      await fetch(`/api/modules/hr/calendar/${selectedEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          startAt: new Date(data.startAt).toISOString(),
          endAt: new Date(data.endAt).toISOString(),
          roomId: data.roomId || null,
        }),
      })
    } else {
      // Create
      await fetch("/api/modules/hr/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          startAt: new Date(data.startAt).toISOString(),
          endAt: new Date(data.endAt).toISOString(),
          roomId: data.roomId || null,
        }),
      })
    }
    await loadEvents()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/modules/hr/calendar/${id}`, { method: "DELETE" })
    await loadEvents()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-violet-600" />
          <h1 className="text-lg font-semibold">Календарь</h1>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Сегодня
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium capitalize min-w-[180px] text-center">
            {getTitle()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <TabsList>
              {FILTER_OPTIONS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* View mode */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day">День</TabsTrigger>
              <TabsTrigger value="week">Неделя</TabsTrigger>
              <TabsTrigger value="month">Месяц</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button onClick={() => openNewEvent()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Новое событие
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar area */}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            </div>
          )}
          {viewMode === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              onSlotClick={(date) => openNewEvent(date)}
              onEventClick={openEditEvent}
            />
          )}
          {viewMode === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              onSlotClick={(date) => openNewEvent(date)}
              onEventClick={openEditEvent}
            />
          )}
          {viewMode === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onEventClick={openEditEvent}
            />
          )}
        </div>

        {/* Rooms sidebar */}
        <div className="w-[220px] border-l p-3 overflow-y-auto flex-shrink-0">
          <div className="text-sm font-semibold mb-3">Переговорные</div>
          <RoomSidebar rooms={rooms} events={events} />
        </div>
      </div>

      {/* Event modal */}
      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={selectedEvent}
        defaultDate={defaultDate}
        rooms={rooms}
        onSave={handleSave}
        onDelete={selectedEvent ? handleDelete : undefined}
      />
    </div>
  )
}
