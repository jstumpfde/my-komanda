"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Trash2 } from "lucide-react"
import type { CalendarEvent } from "./week-view"

interface Room {
  id: string
  name: string
  capacity?: number | null
  floor?: string | null
}

interface EventModalProps {
  open: boolean
  onClose: () => void
  event?: CalendarEvent | null
  defaultDate?: Date | null
  rooms: Room[]
  onSave: (data: EventFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export interface EventFormData {
  title: string
  type: string
  startAt: string
  endAt: string
  description: string
  roomId: string
}

const EVENT_TYPES = [
  { value: "meeting", label: "Встреча" },
  { value: "interview", label: "Интервью" },
  { value: "training", label: "Обучение" },
  { value: "booking", label: "Бронирование" },
  { value: "other", label: "Другое" },
]

function toLocalDatetime(date: Date | string): string {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventModal({
  open,
  onClose,
  event,
  defaultDate,
  rooms,
  onSave,
  onDelete,
}: EventModalProps) {
  const [title, setTitle] = useState("")
  const [type, setType] = useState("meeting")
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [description, setDescription] = useState("")
  const [roomId, setRoomId] = useState("")
  const [conflict, setConflict] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setType(event.type)
      setStartAt(toLocalDatetime(event.startAt))
      setEndAt(toLocalDatetime(event.endAt))
      setDescription("")
      setRoomId(event.roomId ?? "")
    } else if (defaultDate) {
      const start = defaultDate
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      setTitle("")
      setType("meeting")
      setStartAt(toLocalDatetime(start))
      setEndAt(toLocalDatetime(end))
      setDescription("")
      setRoomId("")
    }
    setConflict(null)
  }, [event, defaultDate, open])

  const checkAvailability = async () => {
    if (!roomId || !startAt || !endAt) return
    const params = new URLSearchParams({
      roomId,
      start: new Date(startAt).toISOString(),
      end: new Date(endAt).toISOString(),
    })
    try {
      const res = await fetch(`/api/modules/hr/rooms/availability?${params}`)
      const data = await res.json()
      if (!data.available) {
        const conflictTitles = data.conflicts
          .map((c: CalendarEvent) => c.title)
          .join(", ")
        setConflict(`Переговорная занята: ${conflictTitles}`)
      } else {
        setConflict(null)
      }
    } catch {
      // ignore
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !startAt || !endAt) return
    setLoading(true)
    try {
      await onSave({ title, type, startAt, endAt, description, roomId })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!event || !onDelete) return
    setLoading(true)
    try {
      await onDelete(event.id)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[440px] sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>{event ? "Редактировать событие" : "Новое событие"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Название</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название события"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="type">Тип</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startAt">Начало</Label>
              <Input
                id="startAt"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endAt">Конец</Label>
              <Input
                id="endAt"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="room">Переговорная</Label>
            <Select
              value={roomId}
              onValueChange={(v) => {
                setRoomId(v)
                setConflict(null)
              }}
            >
              <SelectTrigger id="room">
                <SelectValue placeholder="Без переговорной" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Без переговорной</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.capacity ? ` (${r.capacity} чел.)` : ""}
                    {r.floor ? `, ${r.floor} эт.` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roomId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs mt-1"
                onClick={checkAvailability}
              >
                Проверить доступность
              </Button>
            )}
            {conflict && (
              <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                <AlertCircle className="h-3 w-3" />
                {conflict}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Дополнительная информация"
              rows={3}
            />
          </div>

          <SheetFooter className="flex justify-between pt-2">
            {event && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Удалить
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading}>
                {event ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
