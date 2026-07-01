"use client"

import { useState, useEffect } from "react"
import { Clock, Bell, Plug, Save, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Plus, X } from "lucide-react"
import type { CompanyHiringDefaults, InterviewTimeRange } from "@/lib/db/schema"
import {
  INTERVIEW_METHOD_ORDER,
  INTERVIEW_METHOD_LABELS,
  getInterviewMethodConfigs,
  type MethodConfig,
} from "@/lib/hiring/interview-methods"
import { resolveDaySchedule, type DayId, type DaySchedule } from "@/lib/schedule/day-windows"

// ─── Constants ──────────────────────────────────────────────────────────────

const INTERVIEW_DAYS: { id: DayId; label: string; full: string }[] = [
  { id: "mon", label: "Пн", full: "Понедельник" },
  { id: "tue", label: "Вт", full: "Вторник" },
  { id: "wed", label: "Ср", full: "Среда" },
  { id: "thu", label: "Чт", full: "Четверг" },
  { id: "fri", label: "Пт", full: "Пятница" },
  { id: "sat", label: "Сб", full: "Суббота" },
  { id: "sun", label: "Вс", full: "Воскресенье" },
]

// Готовый список времени (шаг 30 мин) для селектов окон.
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`)
  }
  return out
})()

const DURATION_OPTIONS = [
  { value: 15,  label: "15 мин" },
  { value: 30,  label: "30 мин" },
  { value: 45,  label: "45 мин" },
  { value: 60,  label: "60 мин" },
  { value: 90,  label: "90 мин" },
]

const BUFFER_OPTIONS = [
  { value: 0,  label: "Без буфера" },
  { value: 5,  label: "5 мин" },
  { value: 10, label: "10 мин" },
  { value: 15, label: "15 мин" },
  { value: 30, label: "30 мин" },
]

// Шаг сетки слотов для записи (готовые варианты, без ручного ввода).
const SLOT_STEP_OPTIONS = [
  { value: 15, label: "15 мин" },
  { value: 20, label: "20 мин" },
  { value: 30, label: "30 мин" },
  { value: 40, label: "40 мин" },
  { value: 45, label: "45 мин" },
  { value: 50, label: "50 мин" },
  { value: 60, label: "60 мин" },
]

// ─── Компонент ──────────────────────────────────────────────────────────────

export function InterviewSection({
  defaults,
  onPatch,
}: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const schedule = defaults.schedule ?? {}

  // ── Способы интервью (нормализованный массив из модели) ──
  const [methodConfigs, setMethodConfigs] = useState<MethodConfig[]>(() =>
    getInterviewMethodConfigs(schedule)
  )

  // ── Способ интервью по умолчанию ──
  const [defaultMethod, setDefaultMethod] = useState<string>(
    schedule.defaultInterviewMethod ?? ""
  )

  // ── Адрес офиса ──
  const [officeAddress, setOfficeAddress] = useState<string>(
    schedule.officeAddress ?? ""
  )

  // ── Часовой пояс ──
  const [timezone, setTimezone] = useState<string>(
    schedule.timezone ?? "Europe/Moscow"
  )

  // ── Часы для записи кандидатов ──
  const [maxPerDay, setMaxPerDay] = useState<string>(
    schedule.maxPerDay != null ? String(schedule.maxPerDay) : "8"
  )

  // ── Шаг сетки слотов ──
  const [slotStep, setSlotStep] = useState<number>(schedule.slotStep ?? 30)

  // ── Окна доступности по дням недели (с backward-compat деривацией) ──
  const [daySchedule, setDaySchedule] = useState<DaySchedule>(() =>
    resolveDaySchedule(schedule)
  )

  // ── Напоминания ──
  const [remind24h, setRemind24h] = useState<boolean>(schedule.remind24h ?? true)
  const [remind2h, setRemind2h] = useState<boolean>(schedule.remind2h ?? true)

  // ── Флаг platform admin (для блока интеграций) ──
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(d => setIsPlatformAdmin(!!(d?.data ?? d)?.isPlatformAdmin))
      .catch(() => {})
  }, [])

  // ── Состояния сохранения ──
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ── Хелперы ──

  function toggleMethod(method: string) {
    setMethodConfigs(prev =>
      prev.map(c => (c.method === method ? { ...c, enabled: !c.enabled } : c))
    )
  }

  function setMethodDuration(method: string, duration: number) {
    setMethodConfigs(prev =>
      prev.map(c => (c.method === method ? { ...c, duration } : c))
    )
  }

  function setMethodBuffer(method: string, buffer: number) {
    setMethodConfigs(prev =>
      prev.map(c => (c.method === method ? { ...c, buffer } : c))
    )
  }

  // ── Хелперы окон доступности ──

  function updateDayWindows(day: DayId, windows: InterviewTimeRange[]) {
    setDaySchedule(prev => ({ ...prev, [day]: windows }))
  }

  function addWindow(day: DayId) {
    // Дефолт: если у дня нет окон — целый рабочий день; иначе — вечернее окно.
    const existing = daySchedule[day]
    const next = existing.length === 0
      ? { from: "09:00", to: "18:00" }
      : { from: "14:00", to: "16:00" }
    updateDayWindows(day, [...existing, next])
  }

  function removeWindow(day: DayId, idx: number) {
    updateDayWindows(day, daySchedule[day].filter((_, i) => i !== idx))
  }

  function setWindowField(day: DayId, idx: number, field: "from" | "to", value: string) {
    updateDayWindows(
      day,
      daySchedule[day].map((w, i) => (i === idx ? { ...w, [field]: value } : w)),
    )
  }

  function clearDay(day: DayId) {
    updateDayWindows(day, [])
  }

  // ── Сохранение ──

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      // legacy interviewMethods — массив включённых method-id для старых потребителей
      const enabledMethods = methodConfigs.filter(c => c.enabled).map(c => c.method)

      await onPatch({
        schedule: {
          ...schedule,
          // новая per-method модель
          interviewMethodConfigs: methodConfigs,
          // legacy (синхронизация для обратной совместимости)
          interviewMethods: enabledMethods,
          // офис
          officeAddress,
          // время/дни
          timezone,
          maxPerDay: maxPerDay || "8",
          // шаг сетки
          slotStep,
          // окна доступности по дням недели (новый источник правды).
          // Отсеиваем вырожденные окна (from>=to).
          interviewDaySchedule: {
            mon: daySchedule.mon.filter(w => w.from < w.to),
            tue: daySchedule.tue.filter(w => w.from < w.to),
            wed: daySchedule.wed.filter(w => w.from < w.to),
            thu: daySchedule.thu.filter(w => w.from < w.to),
            fri: daySchedule.fri.filter(w => w.from < w.to),
            sat: daySchedule.sat.filter(w => w.from < w.to),
            sun: daySchedule.sun.filter(w => w.from < w.to),
          },
          // напоминания
          remind24h,
          remind2h,
          // способ интервью по умолчанию
          defaultInterviewMethod: defaultMethod,
        },
      })
      setSaved(true)
      toast.success("Настройки интервью сохранены")
      setTimeout(() => setSaved(false), 2500)
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  // ── Определяем, включён ли офис ──
  const officeEnabled = methodConfigs.find(c => c.method === "office")?.enabled ?? false

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Блок 1: Способы интервью */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />Способы проведения интервью
          </CardTitle>
          <CardDescription>
            Для каждого способа задайте длительность и буфер между встречами.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {INTERVIEW_METHOD_ORDER.map(method => {
            const cfg = methodConfigs.find(c => c.method === method)
            if (!cfg) return null
            const label = INTERVIEW_METHOD_LABELS[method]
            return (
              <div
                key={method}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  cfg.enabled ? "border-border bg-background" : "border-border/60 bg-muted/20"
                )}
              >
                {/* Тумблер + название */}
                <Switch
                  checked={cfg.enabled}
                  onCheckedChange={() => toggleMethod(method)}
                  className="shrink-0"
                />
                <span className={cn("text-sm flex-1", !cfg.enabled && "text-muted-foreground")}>
                  {label}
                </span>

                {/* Длительность */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Длит.</span>
                  <Select
                    value={String(cfg.duration)}
                    onValueChange={val => setMethodDuration(method, parseInt(val, 10))}
                    disabled={!cfg.enabled}
                  >
                    <SelectTrigger className="h-8 w-[90px] text-xs bg-[var(--input-bg)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Буфер */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Буфер</span>
                  <Select
                    value={String(cfg.buffer)}
                    onValueChange={val => setMethodBuffer(method, parseInt(val, 10))}
                    disabled={!cfg.enabled}
                  >
                    <SelectTrigger className="h-8 w-[100px] text-xs bg-[var(--input-bg)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUFFER_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Способ по умолчанию */}
                {cfg.enabled && (
                  <button
                    type="button"
                    onClick={() => setDefaultMethod(method)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors",
                      defaultMethod === method
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className={cn(
                      "size-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                      defaultMethod === method
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/50"
                    )}>
                      {defaultMethod === method && (
                        <span className="size-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    По умолчанию
                  </button>
                )}
              </div>
            )
          })}

          {/* Адрес офиса — только когда офис включён */}
          {officeEnabled && (
            <div className="space-y-1.5 pt-2">
              <Label className="text-xs text-muted-foreground">Адрес офиса</Label>
              <Textarea
                placeholder="Москва, ул. Тверская, 1, БЦ «Альфа», 3 этаж"
                rows={2}
                value={officeAddress}
                onChange={e => setOfficeAddress(e.target.value)}
                className="text-sm bg-[var(--input-bg)]"
              />
            </div>
          )}

          {/* Часовой пояс */}
          <div className="space-y-1.5 pt-2">
            <Label className="text-xs text-muted-foreground">Часовой пояс HR</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Kaliningrad">Калининград (UTC+2)</SelectItem>
                <SelectItem value="Europe/Moscow">Москва (UTC+3)</SelectItem>
                <SelectItem value="Europe/Samara">Самара (UTC+4)</SelectItem>
                <SelectItem value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</SelectItem>
                <SelectItem value="Asia/Omsk">Омск (UTC+6)</SelectItem>
                <SelectItem value="Asia/Krasnoyarsk">Красноярск (UTC+7)</SelectItem>
                <SelectItem value="Asia/Irkutsk">Иркутск (UTC+8)</SelectItem>
                <SelectItem value="Asia/Yakutsk">Якутск (UTC+9)</SelectItem>
                <SelectItem value="Asia/Vladivostok">Владивосток (UTC+10)</SelectItem>
                <SelectItem value="Asia/Magadan">Магадан (UTC+11)</SelectItem>
                <SelectItem value="Asia/Kamchatka">Камчатка (UTC+12)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Блок 2: Интеграции календарей (заглушка, только для platformAdmin) */}
      <Card className={cn(!isPlatformAdmin && "hidden")}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground" />Интеграции календарей
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">
              Скоро
            </Badge>
          </CardTitle>
          <CardDescription>
            Двусторонняя синхронизация слотов и автосоздание встреч.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { id: "gcal",    label: "Google Calendar" },
            { id: "outlook", label: "Outlook Calendar" },
            { id: "yandex",  label: "Яндекс Календарь" },
            { id: "zoom",    label: "Zoom OAuth" },
          ].map(integration => (
            <div key={integration.id} className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">{integration.label}</span>
              <Button size="sm" variant="outline" disabled className="h-7 text-xs">
                Подключить
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Блок 3: Часы для записи кандидатов */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />Часы для записи кандидатов
          </CardTitle>
          <CardDescription>Могут отличаться от общего графика компании</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Макс. в день</Label>
              <Input
                value={maxPerDay}
                onChange={e => setMaxPerDay(e.target.value.replace(/\D/g, ""))}
                className="w-20 h-9 text-sm bg-[var(--input-bg)]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Шаг записи</Label>
              <Select value={String(slotStep)} onValueChange={v => setSlotStep(parseInt(v, 10))}>
                <SelectTrigger className="w-28 h-9 text-sm bg-[var(--input-bg)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_STEP_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Окна доступности по дням недели */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Окна доступности по дням недели
            </Label>
            <p className="text-xs text-muted-foreground">
              У дня может быть несколько окон. Перерыв (обед) — просто разрыв между
              окнами. День без окон — записи не принимаем.
            </p>
            <div className="space-y-2">
              {INTERVIEW_DAYS.map(day => {
                const windows = daySchedule[day.id]
                const active = windows.length > 0
                return (
                  <div
                    key={day.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      active ? "border-border bg-background" : "border-border/60 bg-muted/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={active}
                        onCheckedChange={checked =>
                          checked ? addWindow(day.id) : clearDay(day.id)
                        }
                        className="shrink-0"
                      />
                      <span className={cn("text-sm font-medium flex-1", !active && "text-muted-foreground")}>
                        {day.full}
                      </span>
                      {!active && (
                        <span className="text-xs text-muted-foreground">не принимаем</span>
                      )}
                      {active && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => addWindow(day.id)}
                        >
                          <Plus className="size-3.5" /> Окно
                        </Button>
                      )}
                    </div>

                    {active && (
                      <div className="mt-2.5 space-y-2 pl-[3.25rem]">
                        {windows.map((w, idx) => {
                          const invalid = w.from >= w.to
                          return (
                            <div key={idx} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">с</span>
                              <Select
                                value={w.from}
                                onValueChange={v => setWindowField(day.id, idx, "from", v)}
                              >
                                <SelectTrigger className="h-8 w-[92px] text-xs bg-[var(--input-bg)]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_OPTIONS.map(t => (
                                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-xs text-muted-foreground">до</span>
                              <Select
                                value={w.to}
                                onValueChange={v => setWindowField(day.id, idx, "to", v)}
                              >
                                <SelectTrigger className={cn(
                                  "h-8 w-[92px] text-xs bg-[var(--input-bg)]",
                                  invalid && "border-destructive text-destructive"
                                )}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_OPTIONS.map(t => (
                                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {invalid && (
                                <span className="text-[11px] text-destructive">
                                  «до» позже «с»
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeWindow(day.id, idx)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                aria-label="Удалить окно"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Блок 4: Напоминания */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />Напоминания
          </CardTitle>
          <CardDescription>Автоматические уведомления об интервью</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">За 24 часа до интервью</p>
              <p className="text-xs text-muted-foreground">Email и push-уведомление кандидату и HR</p>
            </div>
            <Switch checked={remind24h} onCheckedChange={setRemind24h} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">За 2 часа до интервью</p>
              <p className="text-xs text-muted-foreground">Push-уведомление кандидату</p>
            </div>
            <Switch checked={remind2h} onCheckedChange={setRemind2h} />
          </div>
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      <div className="flex justify-end">
        <Button
          className="gap-2"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </div>
  )
}
