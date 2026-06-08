"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2,
  Save,
  CalendarClock,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { DEFAULT_SCHEDULE, DEFAULT_BREAKS, DAY_LABELS } from "@/lib/booking/constants"

// ─── Типы ────────────────────────────────────────────────────────────────────

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

interface DaySchedule {
  active: boolean
  start: string
  end: string
}

type ScheduleMap = Record<DayKey, DaySchedule>

interface BreakSlot {
  start: string
  end: string
}

interface Resource {
  id: string
  name: string
  type: string | null
  isActive: boolean
  schedule: ScheduleMap | null
  breaks: BreakSlot[] | null
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function buildSchedule(raw: unknown): ScheduleMap {
  const base = { ...DEFAULT_SCHEDULE } as ScheduleMap
  if (!raw || typeof raw !== "object") return base
  const src = raw as Record<string, Partial<DaySchedule>>
  for (const day of DAY_ORDER) {
    if (src[day]) {
      base[day] = {
        active: src[day].active ?? base[day].active,
        start:  src[day].start  ?? base[day].start,
        end:    src[day].end    ?? base[day].end,
      }
    }
  }
  return base
}

function buildBreaks(raw: unknown): BreakSlot[] {
  if (Array.isArray(raw)) return raw as BreakSlot[]
  return [...DEFAULT_BREAKS]
}

// ─── Компонент-строка одного дня ─────────────────────────────────────────────

function DayRow({
  day,
  value,
  onChange,
}: {
  day: DayKey
  value: DaySchedule
  onChange: (patch: Partial<DaySchedule>) => void
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${value.active ? "border-border bg-background" : "border-border/50 bg-muted/30"}`}>
      {/* Переключатель + название дня */}
      <Switch
        checked={value.active}
        onCheckedChange={(checked) => onChange({ active: checked })}
        className="shrink-0"
      />
      <span className={`w-8 text-sm font-medium shrink-0 ${value.active ? "text-foreground" : "text-muted-foreground"}`}>
        {DAY_LABELS[day]}
      </span>

      {/* Время работы */}
      {value.active ? (
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">с</Label>
            <Input
              type="time"
              value={value.start}
              onChange={(e) => onChange({ start: e.target.value })}
              className="h-8 w-28 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">до</Label>
            <Input
              type="time"
              value={value.end}
              onChange={(e) => onChange({ end: e.target.value })}
              className="h-8 w-28 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">
            {((): string => {
              const [sh, sm] = value.start.split(":").map(Number)
              const [eh, em] = value.end.split(":").map(Number)
              const diff = (eh * 60 + em) - (sh * 60 + sm)
              if (diff <= 0) return ""
              const h = Math.floor(diff / 60)
              const m = diff % 60
              return h > 0 && m > 0 ? `${h} ч ${m} мин` : h > 0 ? `${h} ч` : `${m} мин`
            })()}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground flex-1">Выходной</span>
      )}
    </div>
  )
}

// ─── Компонент редактирования расписания одного ресурса ───────────────────────

function ResourceScheduleEditor({
  resource,
  onSave,
  saving,
}: {
  resource: Resource
  onSave: (id: string, schedule: ScheduleMap, breaks: BreakSlot[]) => Promise<void>
  saving: boolean
}) {
  const [schedule, setSchedule] = useState<ScheduleMap>(() => buildSchedule(resource.schedule))
  const [breaks, setBreaks] = useState<BreakSlot[]>(() => buildBreaks(resource.breaks))
  const [expanded, setExpanded] = useState(true)
  const [dirty, setDirty] = useState(false)

  const patchDay = (day: DayKey, patch: Partial<DaySchedule>) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }))
    setDirty(true)
  }

  const patchBreak = (i: number, patch: Partial<BreakSlot>) => {
    setBreaks((prev) => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b))
    setDirty(true)
  }

  const addBreak = () => {
    setBreaks((prev) => [...prev, { start: "13:00", end: "14:00" }])
    setDirty(true)
  }

  const removeBreak = (i: number) => {
    setBreaks((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const handleSave = async () => {
    await onSave(resource.id, schedule, breaks)
    setDirty(false)
  }

  return (
    <Card className={`transition-all ${!resource.isActive ? "opacity-60" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-base truncate">{resource.name}</CardTitle>
            {!resource.isActive && (
              <Badge variant="secondary" className="shrink-0 text-xs">неактивен</Badge>
            )}
            {dirty && (
              <Badge variant="outline" className="shrink-0 text-xs text-amber-600 border-amber-300">
                изменено
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span className="ml-1">Сохранить</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {!expanded && (
          <p className="text-xs text-muted-foreground">
            {DAY_ORDER.filter((d) => schedule[d].active)
              .map((d) => `${DAY_LABELS[d]} ${schedule[d].start}–${schedule[d].end}`)
              .join(", ") || "Нет рабочих дней"}
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-2">
          {/* Дни недели */}
          <div className="space-y-2">
            {DAY_ORDER.map((day) => (
              <DayRow
                key={day}
                day={day}
                value={schedule[day]}
                onChange={(patch) => patchDay(day, patch)}
              />
            ))}
          </div>

          <Separator />

          {/* Перерывы */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Перерывы</Label>
              <Button variant="outline" size="sm" onClick={addBreak} className="h-7 text-xs">
                + Добавить
              </Button>
            </div>
            {breaks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Перерывов нет</p>
            ) : (
              breaks.map((br, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">с</Label>
                    <Input
                      type="time"
                      value={br.start}
                      onChange={(e) => patchBreak(i, { start: e.target.value })}
                      className="h-8 w-28 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">до</Label>
                    <Input
                      type="time"
                      value={br.end}
                      onChange={(e) => patchBreak(i, { end: e.target.value })}
                      className="h-8 w-28 text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeBreak(i)}
                  >
                    ×
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Главный экспортируемый компонент ────────────────────────────────────────

export function ScheduleTab() {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [resources, setResources] = useState<Resource[]>([])
  // Глобальные настройки слотов (per-tenant, из sales_settings).
  const [slotStep, setSlotStep] = useState(30)
  const [bookAhead, setBookAhead] = useState(14)
  const [savingStep, setSavingStep] = useState(false)

  // ── Загрузка настроек слотов ──
  useEffect(() => {
    fetch("/api/modules/sales/settings")
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data ?? j
        if (typeof d?.slotStepMinutes === "number") setSlotStep(d.slotStepMinutes)
        if (typeof d?.bookAheadDays === "number") setBookAhead(d.bookAheadDays)
      })
      .catch(() => {})
  }, [])

  const saveStep = useCallback(async () => {
    setSavingStep(true)
    try {
      const res = await fetch("/api/modules/sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStepMinutes: slotStep, bookAheadDays: bookAhead }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error)
      }
      toast.success("Настройки слотов сохранены")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить")
    } finally {
      setSavingStep(false)
    }
  }, [slotStep, bookAhead])

  const slotStepCard = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Сетка слотов</CardTitle>
        <CardDescription>Шаг времени и горизонт записи — бот предлагает слоты по этим правилам.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Шаг слота</Label>
          <Select value={String(slotStep)} onValueChange={(v) => setSlotStep(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                <SelectItem key={m} value={String(m)}>{m} мин</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Запись вперёд (дней)</Label>
          <Input
            type="number"
            min={1}
            max={90}
            value={bookAhead}
            onChange={(e) => setBookAhead(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            className="w-28"
          />
        </div>
        <Button onClick={saveStep} disabled={savingStep}>
          {savingStep ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Сохранить
        </Button>
      </CardContent>
    </Card>
  )

  // ── Загрузка ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch("/api/modules/booking/resources")
        if (!res.ok) throw new Error("Ошибка загрузки ресурсов")
        const json = await res.json()
        const data = (json?.data ?? json) as { resources: Resource[] }
        if (!alive) return
        setResources(Array.isArray(data.resources) ? data.resources : [])
      } catch {
        if (alive) toast.error("Не удалось загрузить расписание")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ── Сохранение расписания ресурса ──
  const saveResource = useCallback(
    async (id: string, schedule: ScheduleMap, breaks: BreakSlot[]) => {
      setSavingId(id)
      try {
        const res = await fetch(`/api/modules/booking/resources/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule, breaks }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error)
        }
        const json = await res.json()
        const updated = (json?.data ?? json) as Resource
        // Обновить ресурс в стейте
        setResources((prev) =>
          prev.map((r) => (r.id === id ? { ...r, schedule: updated.schedule, breaks: updated.breaks } : r))
        )
        toast.success("Расписание сохранено")
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить")
      } finally {
        setSavingId(null)
      }
    },
    [],
  )

  // ─── Состояние загрузки ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Загрузка расписания…
      </div>
    )
  }

  // ─── Если ресурсов нет ─────────────────────────────────────────────────────

  if (resources.length === 0) {
    return (
      <div className="space-y-6 max-w-2xl">
        {/* Информация о том, как работает расписание */}
        <SlotInfoCard />
        {slotStepCard}
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Нет мастеров / ресурсов</p>
            <p className="text-sm text-muted-foreground">
              Расписание задаётся для каждого мастера или кабинета.
              Сначала создайте ресурс на вкладке «Мастера».
            </p>
            <p className="text-xs text-muted-foreground/70">
              Пока мастеров нет, бот использует расписание по умолчанию:{" "}
              {Object.entries(DEFAULT_SCHEDULE)
                .filter(([, v]) => v.active)
                .map(([k, v]) => `${DAY_LABELS[k]} ${v.start}–${v.end}`)
                .join(", ")}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Основной UI ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      <SlotInfoCard />
      {slotStepCard}

      {/* Список ресурсов с редактированием расписания */}
      {resources.map((resource) => (
        <ResourceScheduleEditor
          key={resource.id}
          resource={resource}
          onSave={saveResource}
          saving={savingId === resource.id}
        />
      ))}
    </div>
  )
}

// ─── Карточка-пояснение ───────────────────────────────────────────────────────

function SlotInfoCard() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary shrink-0" />
          <CardTitle className="text-sm font-medium text-primary">Как работает расписание</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <p className="text-xs text-muted-foreground">
          Бот предлагает клиентам свободные временные слоты, основываясь на расписании мастеров и уже
          созданных записях. Каждый мастер или ресурс может иметь своё рабочее время и перерывы.
        </p>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            <strong className="text-foreground">Шаг слота</strong> и горизонт записи настраиваются
            ниже в блоке «Сетка слотов».
          </span>
        </div>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Длительность слота подбирается автоматически под длительность выбранной услуги.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
