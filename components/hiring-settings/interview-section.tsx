"use client"

import { useState, useEffect } from "react"
import { Clock, Bell, Plug, Save } from "lucide-react"
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
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import {
  INTERVIEW_METHOD_ORDER,
  INTERVIEW_METHOD_LABELS,
  getInterviewMethodConfigs,
  type MethodConfig,
} from "@/lib/hiring/interview-methods"

// ─── Constants ──────────────────────────────────────────────────────────────

const INTERVIEW_DAYS = [
  { id: "mon", label: "Пн" },
  { id: "tue", label: "Вт" },
  { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" },
  { id: "fri", label: "Пт" },
  { id: "sat", label: "Сб" },
  { id: "sun", label: "Вс" },
]

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
  const [interviewFrom, setInterviewFrom] = useState<string>(
    schedule.interviewFrom ?? "09:00"
  )
  const [interviewTo, setInterviewTo] = useState<string>(
    schedule.interviewTo ?? "18:00"
  )
  const [maxPerDay, setMaxPerDay] = useState<string>(
    schedule.maxPerDay != null ? String(schedule.maxPerDay) : "8"
  )
  const [interviewDays, setInterviewDays] = useState<Set<string>>(
    new Set(
      Array.isArray(schedule.interviewDays) && schedule.interviewDays.length > 0
        ? schedule.interviewDays
        : ["mon", "tue", "wed", "thu", "fri"]
    )
  )

  // ── Шаг сетки слотов ──
  const [slotStep, setSlotStep] = useState<number>(schedule.slotStep ?? 30)

  // ── Обеденный перерыв ──
  const [lunchEnabled, setLunchEnabled] = useState<boolean>(schedule.lunchEnabled ?? false)
  const [lunchFrom, setLunchFrom] = useState<string>(schedule.lunchFrom ?? "13:00")
  const [lunchTo, setLunchTo] = useState<string>(schedule.lunchTo ?? "14:00")

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

  function toggleDay(dayId: string) {
    setInterviewDays(prev => {
      const next = new Set(prev)
      if (next.has(dayId)) {
        next.delete(dayId)
      } else {
        next.add(dayId)
      }
      return next
    })
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
          interviewFrom,
          interviewTo,
          interviewDays: Array.from(interviewDays),
          maxPerDay: maxPerDay || "8",
          // шаг сетки + обеденный перерыв
          slotStep,
          lunchEnabled,
          lunchFrom,
          lunchTo,
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
              <Label className="text-xs text-muted-foreground">С</Label>
              <Input
                type="time"
                value={interviewFrom}
                onChange={e => setInterviewFrom(e.target.value)}
                className="w-28 h-9 text-sm bg-[var(--input-bg)]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">До</Label>
              <Input
                type="time"
                value={interviewTo}
                onChange={e => setInterviewTo(e.target.value)}
                className="w-28 h-9 text-sm bg-[var(--input-bg)]"
              />
            </div>
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

          {/* Обеденный перерыв */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Обеденный перерыв</p>
                <p className="text-xs text-muted-foreground">В это время слоты не предлагаются</p>
              </div>
              <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
            </div>
            {lunchEnabled && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">С</Label>
                  <Input type="time" value={lunchFrom} onChange={e => setLunchFrom(e.target.value)} className="w-28 h-9 text-sm bg-[var(--input-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">До</Label>
                  <Input type="time" value={lunchTo} onChange={e => setLunchTo(e.target.value)} className="w-28 h-9 text-sm bg-[var(--input-bg)]" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Дни для интервью</Label>
            <div className="flex gap-2 flex-wrap">
              {INTERVIEW_DAYS.map(day => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => toggleDay(day.id)}
                  className={cn(
                    "w-10 h-10 rounded-lg text-sm font-medium transition-all",
                    interviewDays.has(day.id)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {day.label}
                </button>
              ))}
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
          variant={saved ? "outline" : "default"}
        >
          <Save className="size-4" />
          {saving ? "Сохранение…" : saved ? "Сохранено" : "Сохранить"}
        </Button>
      </div>
    </div>
  )
}
