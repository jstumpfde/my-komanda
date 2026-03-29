"use client"

import { useMemo } from "react"
import { isBefore, isAfter, addMinutes } from "date-fns"
import { Users, Layers, MapPin, Circle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { CalendarEvent } from "./week-view"

interface Room {
  id: string
  name: string
  capacity?: number | null
  floor?: string | null
  equipment?: string[] | null
  isActive?: boolean | null
}

interface RoomSidebarProps {
  rooms: Room[]
  events: CalendarEvent[]
}

type OccupancyStatus = "free" | "soon" | "occupied"

function getRoomStatus(room: Room, events: CalendarEvent[], now: Date): OccupancyStatus {
  const roomEvents = events.filter((e) => e.roomId === room.id)
  const isOccupied = roomEvents.some(
    (e) => isBefore(new Date(e.startAt), now) && isAfter(new Date(e.endAt), now)
  )
  if (isOccupied) return "occupied"

  const soonThreshold = addMinutes(now, 30)
  const isSoon = roomEvents.some(
    (e) =>
      isBefore(now, new Date(e.startAt)) &&
      isBefore(new Date(e.startAt), soonThreshold)
  )
  if (isSoon) return "soon"

  return "free"
}

const STATUS_CONFIG: Record<OccupancyStatus, { label: string; dot: string; badge: string }> = {
  free: { label: "Свободно", dot: "text-green-500", badge: "bg-green-100 text-green-700" },
  soon: { label: "Скоро занято", dot: "text-yellow-500", badge: "bg-yellow-100 text-yellow-700" },
  occupied: { label: "Занято", dot: "text-red-500", badge: "bg-red-100 text-red-700" },
}

export function RoomSidebar({ rooms, events }: RoomSidebarProps) {
  const now = useMemo(() => new Date(), [])

  if (rooms.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        Нет переговорных
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rooms.map((room) => {
        const status = getRoomStatus(room, events, now)
        const cfg = STATUS_CONFIG[status]

        return (
          <div
            key={room.id}
            className="border rounded-lg p-3 space-y-2 hover:border-violet-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm leading-tight">{room.name}</div>
              <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0 ${cfg.badge}`}>
                <Circle className={`h-2 w-2 fill-current ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {room.capacity && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {room.capacity} чел.
                </span>
              )}
              {room.floor && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {room.floor} эт.
                </span>
              )}
            </div>

            {room.equipment && room.equipment.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {room.equipment.map((eq) => (
                  <Badge key={eq} variant="secondary" className="text-[10px] px-1.5 py-0">
                    <Layers className="h-2.5 w-2.5 mr-0.5" />
                    {eq}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
