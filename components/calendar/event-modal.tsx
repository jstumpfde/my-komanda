"use client"

import { useState, useEffect } from "react"
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
  // Поля интервью (отправляются только для type='interview').
  vacancyId?: string | null
  interviewer?: string
  interviewType?: string
  interviewFormat?: string
}

const INTERVIEW_TYPES = ["Техническое", "HR", "Финальное"]
const INTERVIEW_FORMATS = ["Онлайн", "Офис"]

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
  // Поля интервью
  const [vacancyId, setVacancyId] = useState("")
  const [interviewer, setInterviewer] = useState("")
  const [interviewType, setInterviewType] = useState("HR")
  const [interviewFormat, setInterviewFormat] = useState("Онлайн")
  const [vacancies, setVacancies] = useState<{ id: string; title: string }[]>([])

  // Список вакансий для селектора (подгружаем при открытии).
  useEffect(() => {
    if (!open) return
    fetch("/api/modules/hr/vacancies?limit=200")
      .then(r => r.ok ? r.json() : null)
      .then(j => { const v = j?.vacancies ?? j?.data ?? []; setVacancies(v.map((x: { id: string; title: string }) => ({ id: x.id, title: x.title }))) })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setType(event.type)
      setStartAt(toLocalDatetime(event.startAt))
      setEndAt(toLocalDatetime(event.endAt))
      setDescription("")
      setRoomId(event.roomId ?? "")
      setVacancyId(event.vacancyId ?? "")
      setInterviewer(event.interviewer ?? "")
      setInterviewType(event.interviewType ?? "HR")
      setInterviewFormat(event.interviewFormat ?? "Онлайн")
    } else if (defaultDate) {
      const start = defaultDate
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      setTitle("")
      setType("meeting")
      setStartAt(toLocalDatetime(start))
      setEndAt(toLocalDatetime(end))
      setDescription("")
      setRoomId("")
      setVacancyId("")
      setInterviewer("")
      setInterviewType("HR")
      setInterviewFormat("Онлайн")
    }
    setConflict(null)
  }, [event, defaultDate, open])

  // #60: авто-проверка пересечений при изменении времени/переговорной (дебаунс).
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { void checkConflicts() }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startAt, endAt, roomId])

  // #60: авто-проверка конфликтов времени. Покрывает и занятость переговорной,
  // и общее пересечение по времени (двойное бронирование слота). Не блокирует
  // сохранение — только мягкое предупреждение.
  const checkConflicts = async () => {
    if (!startAt || !endAt) { setConflict(null); return }
    const s = new Date(startAt), e = new Date(endAt)
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) { setConflict(null); return }
    const params = new URLSearchParams({ start: s.toISOString(), end: e.toISOString() })
    if (roomId) params.set("roomId", roomId)
    if (event?.id) params.set("excludeId", event.id)
    try {
      const res = await fetch(`/api/modules/hr/calendar/conflicts?${params}`)
      if (!res.ok) return
      const json = await res.json()
      const data = json.data ?? json
      const room: { title: string }[] = data.roomConflicts ?? []
      const time: { title: string }[] = data.timeConflicts ?? []
      if (room.length) {
        setConflict(`Переговорная занята: ${room.map(c => c.title).join(", ")}`)
      } else if (time.length) {
        setConflict(`В это время уже запланировано: ${time.map(c => c.title).join(", ")}`)
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
      const isInterview = type === "interview"
      await onSave({
        title, type, startAt, endAt, description, roomId,
        vacancyId:       isInterview ? (vacancyId || null) : null,
        interviewer:     isInterview ? interviewer : "",
        interviewType:   isInterview ? interviewType : "",
        interviewFormat: isInterview ? interviewFormat : "",
      })
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

          {/* Поля интервью — только для type='interview'. candidate = название события. */}
          {type === "interview" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                Имя кандидата укажите в названии события. Эти поля наполняют раздел «Интервью».
              </p>
              <div className="space-y-1">
                <Label htmlFor="iv-vacancy">Вакансия</Label>
                <Select value={vacancyId || "none"} onValueChange={(v) => setVacancyId(v === "none" ? "" : v)}>
                  <SelectTrigger id="iv-vacancy"><SelectValue placeholder="Не указана" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указана</SelectItem>
                    {vacancies.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="iv-interviewer">Интервьюер</Label>
                <Input id="iv-interviewer" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Кто проводит" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="iv-type">Тип интервью</Label>
                  <Select value={interviewType} onValueChange={setInterviewType}>
                    <SelectTrigger id="iv-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERVIEW_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="iv-format">Формат</Label>
                  <Select value={interviewFormat} onValueChange={setInterviewFormat}>
                    <SelectTrigger id="iv-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERVIEW_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

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
              value={roomId || "none"}
              onValueChange={(v) => {
                setRoomId(v === "none" ? "" : v)
                setConflict(null)
              }}
            >
              <SelectTrigger id="room">
                <SelectValue placeholder="Без переговорной" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без переговорной</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.capacity ? ` (${r.capacity} чел.)` : ""}
                    {r.floor ? `, ${r.floor} эт.` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conflict && (
              <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500 mt-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>{conflict}. Сохранить всё равно можно.</span>
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
