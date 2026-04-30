"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, Save, Plus, Trash2, Clock, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { RU_HOLIDAYS } from "@/lib/schedule/holidays"

interface CustomHoliday {
  from:  string
  to:    string
  label: string
}

interface ScheduleData {
  scheduleEnabled:            boolean
  scheduleStart:              string
  scheduleEnd:                string
  scheduleTimezone:           string
  scheduleWorkingDays:        number[]
  scheduleExcludedHolidayIds: string[]
  scheduleCustomHolidays:     CustomHoliday[]
}

const WEEKDAYS = [
  { id: 1, label: "Пн" },
  { id: 2, label: "Вт" },
  { id: 3, label: "Ср" },
  { id: 4, label: "Чт" },
  { id: 5, label: "Пт" },
  { id: 6, label: "Сб" },
  { id: 7, label: "Вс" },
]

// Часовые пояса РФ — компактный список самых популярных.
const TIMEZONES = [
  { value: "Europe/Kaliningrad",   label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow",        label: "Москва (UTC+3)" },
  { value: "Europe/Samara",        label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg",   label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk",            label: "Омск (UTC+6)" },
  { value: "Asia/Krasnoyarsk",     label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk",         label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk",         label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok",     label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan",         label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka",       label: "Камчатка (UTC+12)" },
]

interface Props {
  vacancyId: string
}

export function VacancyScheduleSettings({ vacancyId }: Props) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-settings`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ScheduleData>
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-settings`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const updated = await res.json() as ScheduleData
      setData(updated)
      toast.success("Расписание сохранено")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка"
      toast.error(`Не удалось сохранить: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleWorkingDay = (id: number) => {
    if (!data) return
    const set = new Set(data.scheduleWorkingDays)
    if (set.has(id)) set.delete(id); else set.add(id)
    setData({ ...data, scheduleWorkingDays: Array.from(set).sort((a, b) => a - b) })
  }

  const toggleHoliday = (id: string) => {
    if (!data) return
    const set = new Set(data.scheduleExcludedHolidayIds)
    if (set.has(id)) set.delete(id); else set.add(id)
    setData({ ...data, scheduleExcludedHolidayIds: Array.from(set) })
  }

  const removeCustom = (idx: number) => {
    if (!data) return
    setData({
      ...data,
      scheduleCustomHolidays: data.scheduleCustomHolidays.filter((_, i) => i !== idx),
    })
  }

  const addCustom = (h: CustomHoliday) => {
    if (!data) return
    setData({ ...data, scheduleCustomHolidays: [...data.scheduleCustomHolidays, h] })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Загрузка расписания...
        </CardContent>
      </Card>
    )
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Не удалось загрузить настройки расписания: {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Рабочие часы и дни
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Соблюдать расписание</Label>
              <p className="text-xs text-muted-foreground">
                В нерабочие часы и дни отправка сообщений откладывается до следующего окна
              </p>
            </div>
            <Switch
              checked={data.scheduleEnabled}
              onCheckedChange={(v) => setData({ ...data, scheduleEnabled: v })}
            />
          </div>

          {data.scheduleEnabled && (
            <>
              <div className="space-y-3">
                <Label className="text-sm">Время</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-sm text-muted-foreground">С</Label>
                  <Input
                    type="time"
                    value={data.scheduleStart}
                    onChange={(e) => setData({ ...data, scheduleStart: e.target.value })}
                    className="w-[120px] h-9"
                  />
                  <Label className="text-sm text-muted-foreground">до</Label>
                  <Input
                    type="time"
                    value={data.scheduleEnd}
                    onChange={(e) => setData({ ...data, scheduleEnd: e.target.value })}
                    className="w-[120px] h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground shrink-0">Часовой пояс:</Label>
                  <Select
                    value={data.scheduleTimezone}
                    onValueChange={(v) => setData({ ...data, scheduleTimezone: v })}
                  >
                    <SelectTrigger className="w-[260px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Дни недели</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const active = data.scheduleWorkingDays.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleWorkingDay(d.id)}
                        className={cn(
                          "px-3 h-9 rounded-md border text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-input hover:border-primary/30",
                        )}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Нерабочие дни
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm">Праздники РФ</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1.5">
              {RU_HOLIDAYS.map((h) => {
                const active = data.scheduleExcludedHolidayIds.includes(h.id)
                return (
                  <label
                    key={h.id}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={active}
                      onCheckedChange={() => toggleHoliday(h.id)}
                    />
                    <span className="text-foreground">
                      {String(h.day).padStart(2, "0")}.{String(h.month).padStart(2, "0")}
                    </span>
                    <span className="text-muted-foreground text-xs truncate">{h.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Свои нерабочие дни</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                onClick={() => setCustomDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" /> Добавить
              </Button>
            </div>
            {data.scheduleCustomHolidays.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Корпоративные отпуска или особые дни — добавьте, если нужно
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.scheduleCustomHolidays.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{c.label || "(без названия)"}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {c.from === c.to ? c.from : `${c.from} — ${c.to}`}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeCustom(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить расписание
        </Button>
      </div>

      <CustomHolidayDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        onAdd={(h) => { addCustom(h); setCustomDialogOpen(false) }}
      />
    </>
  )
}

// ─── Custom holiday dialog ────────────────────────────────────────────────────

function CustomHolidayDialog({
  open, onOpenChange, onAdd,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdd: (h: CustomHoliday) => void
}) {
  const [mode, setMode] = useState<"single" | "range">("single")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  const reset = () => { setMode("single"); setFrom(""); setTo(""); setLabel(""); setError(null) }

  useEffect(() => { if (!open) reset() }, [open])

  const submit = () => {
    if (!from) { setError("Укажите дату"); return }
    const finalTo = mode === "range" ? to : from
    if (mode === "range" && !to) { setError("Укажите дату окончания"); return }
    if (finalTo < from) { setError("Дата окончания раньше начала"); return }
    if (!label.trim()) { setError("Введите название"); return }
    onAdd({ from, to: finalTo, label: label.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Свой нерабочий день</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={cn(
                "flex-1 h-9 rounded-md border text-sm font-medium transition-colors",
                mode === "single"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-input",
              )}
            >
              Один день
            </button>
            <button
              type="button"
              onClick={() => setMode("range")}
              className={cn(
                "flex-1 h-9 rounded-md border text-sm font-medium transition-colors",
                mode === "range"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-input",
              )}
            >
              Период
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{mode === "single" ? "Дата" : "С"}</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setError(null) }} />
          </div>

          {mode === "range" && (
            <div className="space-y-2">
              <Label className="text-sm">До</Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setError(null) }} />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm">Название</Label>
            <Input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null) }}
              placeholder="Например: Корпоративный отпуск"
              maxLength={100}
            />
          </div>

          {error && <p className="text-sm text-destructive">⚠️ {error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="button" onClick={submit}>Добавить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
