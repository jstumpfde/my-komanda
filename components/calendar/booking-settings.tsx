"use client"

// Настройки записи кандидатов и интервью — живут в шестерёнке календаря
// (/hr/calendar → Настройки → таб «Запись кандидатов»). Задача #6 Юрия 11.07:
// календарь записи и длительность интервью настраиваются в ОДНОМ месте.
// Перенесено из components/hiring-settings/interview-section.tsx (страница
// «Настройки HR → Интервью» теперь заглушка со ссылкой сюда).
//
// Хранение НЕ менялось: companies.hiring_defaults_json.schedule
// (GET/PATCH /api/modules/hr/company/hiring-defaults).

import { useState, useEffect } from "react"
import Link from "next/link"
import { Clock, Bell, Plug, Save, Loader2, Video, ExternalLink, Plus, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CompanyHiringDefaults, InterviewTimeRange } from "@/lib/db/schema"
import {
  INTERVIEW_METHOD_LABELS,
  METHOD_DEFAULT_DURATIONS,
  getInterviewMethodConfigs,
  type MethodConfig,
  type InterviewMethodKey,
} from "@/lib/hiring/interview-methods"
import { resolveDaySchedule, type DayId, type DaySchedule } from "@/lib/schedule/day-windows"
import { ManagerReminderBotCard } from "@/components/telegram/manager-reminder-bot-card"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import {
  DEFAULT_REMINDER_TEXTS,
  REMINDER_KINDS,
  REMINDER_KIND_LABELS,
  REMINDER_TEXT_VARS,
  type ReminderChannel,
  type ReminderKind,
} from "@/lib/hr/interview-reminder-texts"

// ─── Constants ──────────────────────────────────────────────────────────────

const HIRING_DEFAULTS_URL = "/api/modules/hr/company/hiring-defaults"

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

const BUFFER_OPTIONS = [
  { value: 0,  label: "Без буфера" },
  { value: 5,  label: "5 мин" },
  { value: 10, label: "10 мин" },
  { value: 15, label: "15 мин" },
  { value: 30, label: "30 мин" },
]

// ── Три вида интервью (видимая модель) → маппятся на methodConfigs (данные) ──

/** Диапазон длительности с шагом 5 мин для select-а вида интервью */
function durationRangeOptions(min: number, max: number): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = []
  for (let v = min; v <= max; v += 5) {
    out.push({ value: v, label: `${v} мин` })
  }
  return out
}

const CALL_DURATION_OPTIONS   = durationRangeOptions(5, 60)   // Звонок: 5–60
const ONLINE_DURATION_OPTIONS = durationRangeOptions(5, 60)   // Онлайн: 5–60
const OFFICE_DURATION_OPTIONS = durationRangeOptions(5, 120)  // В офисе: 5–120

// Канонические дефолты видов — из lib/hiring/interview-methods (один источник).
const CALL_DEFAULT_DURATION   = METHOD_DEFAULT_DURATIONS.phone
const ONLINE_DEFAULT_DURATION = METHOD_DEFAULT_DURATIONS.telemost
const OFFICE_DEFAULT_DURATION = METHOD_DEFAULT_DURATIONS.office

const ONLINE_PLATFORMS: InterviewMethodKey[] = ["telemost", "zoom", "meet"]

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

// ─── Плашка статуса личного Zoom ────────────────────────────────────────────
// Подключение/отключение живёт в Профиле (/settings/profile) — здесь только
// статус со ссылкой, чтобы настраивающий запись сразу видел, готов ли Zoom.

function ZoomStatusPlate() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/integrations/zoom/status")
      .then(r => (r.ok ? r.json() : null))
      .then((j: { data?: { connected: boolean; email: string | null } } | null) => {
        const d = j?.data
        setConnected(!!d?.connected)
        setEmail(d?.email ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Video className="size-4 text-muted-foreground" />Личный Zoom
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Свой Zoom-аккаунт — чтобы создавать ссылку на встречу прямо из карточки
          интервью, от вашего имени.
        </p>
        {loading ? (
          <Skeleton className="h-9 w-full rounded-lg" />
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="text-sm flex items-center gap-2 min-w-0">
              {connected ? (
                <>
                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">Подключено</Badge>
                  {email && <span className="text-muted-foreground truncate">{email}</span>}
                </>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Не подключён</Badge>
              )}
            </span>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" asChild>
              <Link href="/settings/profile">
                {connected ? "Управлять в Профиле" : "Подключить в Профиле"}
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Тексты напоминаний (задача editable-interview-reminder-texts, 14.07) ──
// Одно поле = один порог (24ч/утро/1ч/15мин) одного канала. Пусто → поле
// показывает стандартный текст плейсхолдером и сервер рендерит его же
// (см. lib/hr/interview-reminder-texts.ts DEFAULT_REMINDER_TEXTS).

function ReminderTextField({
  channel, kind, value, onChange,
}: {
  channel: ReminderChannel
  kind: ReminderKind
  value: string
  onChange: (value: string) => void
}) {
  const defaultText = DEFAULT_REMINDER_TEXTS[channel][kind]
  const isCustom = value.trim().length > 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{REMINDER_KIND_LABELS[kind]}</Label>
        {isCustom && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="h-6 text-[11px] px-1.5 text-muted-foreground"
          >
            Сбросить к стандартному
          </Button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultText}
        rows={3}
        className="text-xs font-mono resize-y"
      />
    </div>
  )
}

function ReminderTextsChannelSection({
  channel, texts, onFieldChange,
}: {
  channel: ReminderChannel
  texts: Partial<Record<ReminderKind, string>> | undefined
  onFieldChange: (kind: ReminderKind, value: string) => void
}) {
  const vars = REMINDER_TEXT_VARS.filter((v) => v.channels.includes(channel))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {vars.map((v) => (
          <Badge key={v.token} variant="outline" title={v.description} className="text-[10px] font-mono cursor-help">
            {v.token}
          </Badge>
        ))}
      </div>
      {REMINDER_KINDS.map((kind) => (
        <ReminderTextField
          key={kind}
          channel={channel}
          kind={kind}
          value={texts?.[kind] ?? ""}
          onChange={(value) => onFieldChange(kind, value)}
        />
      ))}
    </div>
  )
}

// ─── Обёртка с самозагрузкой ────────────────────────────────────────────────
// В отличие от страницы «Настройки HR» (грузит defaults для всех секций),
// шестерёнка календаря загружает hiring-defaults сама при открытии Sheet.

export function BookingSettings() {
  const [defaults, setDefaults] = useState<CompanyHiringDefaults | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch(HIRING_DEFAULTS_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { hiringDefaults?: CompanyHiringDefaults }) => {
        setDefaults(d?.hiringDefaults ?? {})
      })
      .catch(() => setLoadError(true))
  }, [])

  const onPatch = async (patch: Partial<CompanyHiringDefaults>) => {
    const res = await fetch(HIRING_DEFAULTS_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error("save_failed")
    const data = (await res.json()) as { hiringDefaults: CompanyHiringDefaults }
    setDefaults((prev) => (prev ? { ...prev, ...data.hiringDefaults } : data.hiringDefaults))
  }

  if (loadError) {
    return <p className="text-sm text-muted-foreground py-6">Не удалось загрузить настройки. Обновите страницу.</p>
  }
  if (!defaults) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }
  return <BookingSettingsForm defaults={defaults} onPatch={onPatch} />
}

// ─── Форма настроек записи (бывший InterviewSection) ────────────────────────

function BookingSettingsForm({
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
  const [remind2h] = useState<boolean>(schedule.remind2h ?? true) // легаси, тумблер больше не показывается
  const [remindMorning, setRemindMorning] = useState<boolean>(schedule.remindMorning ?? true)
  const [remind1h, setRemind1h] = useState<boolean>(schedule.remind1h ?? true)
  const [remind15m, setRemind15m] = useState<boolean>(schedule.remind15m ?? true)

  // ── Тексты напоминаний (задача editable-interview-reminder-texts, 14.07) ──
  // Пустая строка/undefined на поле → placeholder показывает эффективный
  // дефолт (DEFAULT_REMINDER_TEXTS), сервер при пустом значении рендерит его
  // же — «сбросить» просто очищает поле, ничего не «залипает» намертво.
  const [reminderTexts, setReminderTexts] = useState<NonNullable<CompanyHiringDefaults["schedule"]>["reminderTexts"]>(
    () => schedule.reminderTexts ?? {}
  )
  function setReminderTextField(channel: ReminderChannel, kind: ReminderKind, value: string) {
    setReminderTexts(prev => ({
      ...prev,
      [channel]: { ...(prev?.[channel] ?? {}), [kind]: value },
    }))
  }

  // ── Флаг platform admin (для блока интеграций) ──
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const u = d?.data ?? d
        setIsPlatformAdmin(!!u?.isPlatformAdmin)
      })
      .catch(() => {})
  }, [])

  // ── Состояния сохранения ──
  const [saving, setSaving] = useState(false)

  // ── Хелперы ──

  function toggleMethod(method: string) {
    setMethodConfigs(prev =>
      prev.map(c => {
        if (c.method !== method) return c
        const enabled = !c.enabled
        // При первом включении подставляем дефолт вида, если длительность ещё не настроена
        // пользователем (осталась на общем нормализованном дефолте 45 мин из легаси-данных).
        if (enabled && c.duration === 45) {
          const viewDefault = method === "phone" ? CALL_DEFAULT_DURATION : OFFICE_DEFAULT_DURATION
          return { ...c, enabled, duration: viewDefault }
        }
        return { ...c, enabled }
      })
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

  // ── Хелперы для вида «Онлайн» (объединяет telemost/zoom/meet в один UI-блок) ──

  function getOnlineConfig(): MethodConfig {
    // Выбранная платформа — первая включённая из ONLINE_PLATFORMS; иначе телемост (дефолт).
    const active = ONLINE_PLATFORMS.map(m => methodConfigs.find(c => c.method === m))
      .find(c => c?.enabled)
    return active ?? methodConfigs.find(c => c.method === "telemost")!
  }

  function toggleOnline() {
    const current = getOnlineConfig()
    const nextEnabled = !current.enabled
    setMethodConfigs(prev =>
      prev.map(c => {
        if (!ONLINE_PLATFORMS.includes(c.method)) return c
        if (nextEnabled) {
          // включаем — активной становится ранее выбранная (или дефолтная) платформа
          if (c.method !== current.method) return { ...c, enabled: false }
          // При первом включении подставляем дефолт вида «Онлайн», если длительность
          // ещё не настроена пользователем (осталась на легаси-дефолте 45 мин).
          const duration = c.duration === 45 ? ONLINE_DEFAULT_DURATION : c.duration
          return { ...c, enabled: true, duration }
        }
        return { ...c, enabled: false }
      })
    )
  }

  function setOnlinePlatform(method: InterviewMethodKey) {
    setMethodConfigs(prev =>
      prev.map(c =>
        ONLINE_PLATFORMS.includes(c.method) ? { ...c, enabled: c.method === method } : c
      )
    )
  }

  function setOnlineDuration(duration: number) {
    setMethodConfigs(prev =>
      prev.map(c => (ONLINE_PLATFORMS.includes(c.method) ? { ...c, duration } : c))
    )
  }

  function setOnlineBuffer(buffer: number) {
    setMethodConfigs(prev =>
      prev.map(c => (ONLINE_PLATFORMS.includes(c.method) ? { ...c, buffer } : c))
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
          remind2h, // легаси, не редактируется в UI, значение сохраняется как есть
          remindMorning,
          remind1h,
          remind15m,
          // тексты напоминаний (пусто на поле → дефолт, см. lib/hr/interview-reminder-texts.ts)
          reminderTexts,
          // способ интервью по умолчанию
          defaultInterviewMethod: defaultMethod,
        },
      })
      toast.success("Настройки записи сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  // ── Определяем состояния трёх видов интервью ──
  const phoneConfig  = methodConfigs.find(c => c.method === "phone")!
  const officeConfig = methodConfigs.find(c => c.method === "office")!
  const onlineConfig = getOnlineConfig()
  const officeEnabled = officeConfig?.enabled ?? false

  return (
    <div className="space-y-4">

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
          {/* Вид 1: Звонок по телефону */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors flex-wrap",
              phoneConfig.enabled ? "border-border bg-background" : "border-border/60 bg-muted/20"
            )}
          >
            <Switch
              checked={phoneConfig.enabled}
              onCheckedChange={() => toggleMethod("phone")}
              className="shrink-0"
            />
            <span className={cn("text-sm flex-1", !phoneConfig.enabled && "text-muted-foreground")}>
              Звонок по телефону
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Длит.</span>
              <Select
                value={String(phoneConfig.duration)}
                onValueChange={val => setMethodDuration("phone", parseInt(val, 10))}
                disabled={!phoneConfig.enabled}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs bg-[var(--input-bg)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALL_DURATION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Буфер</span>
              <Select
                value={String(phoneConfig.buffer)}
                onValueChange={val => setMethodBuffer("phone", parseInt(val, 10))}
                disabled={!phoneConfig.enabled}
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

            {phoneConfig.enabled && (
              <button
                type="button"
                onClick={() => setDefaultMethod("phone")}
                className={cn(
                  "flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors",
                  defaultMethod === "phone"
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn(
                  "size-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                  defaultMethod === "phone"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/50"
                )}>
                  {defaultMethod === "phone" && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                По умолчанию
              </button>
            )}
          </div>

          {/* Вид 2: Онлайн (платформа выбирается под-селектом) */}
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5 transition-colors space-y-2",
              onlineConfig.enabled ? "border-border bg-background" : "border-border/60 bg-muted/20"
            )}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <Switch
                checked={onlineConfig.enabled}
                onCheckedChange={toggleOnline}
                className="shrink-0"
              />
              <span className={cn("text-sm flex-1", !onlineConfig.enabled && "text-muted-foreground")}>
                Онлайн
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Длит.</span>
                <Select
                  value={String(onlineConfig.duration)}
                  onValueChange={val => setOnlineDuration(parseInt(val, 10))}
                  disabled={!onlineConfig.enabled}
                >
                  <SelectTrigger className="h-8 w-[90px] text-xs bg-[var(--input-bg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ONLINE_DURATION_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Буфер</span>
                <Select
                  value={String(onlineConfig.buffer)}
                  onValueChange={val => setOnlineBuffer(parseInt(val, 10))}
                  disabled={!onlineConfig.enabled}
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

              {onlineConfig.enabled && (
                <button
                  type="button"
                  onClick={() => setDefaultMethod(onlineConfig.method)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors",
                    defaultMethod === onlineConfig.method
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className={cn(
                    "size-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                    defaultMethod === onlineConfig.method
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/50"
                  )}>
                    {defaultMethod === onlineConfig.method && (
                      <span className="size-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  По умолчанию
                </button>
              )}
            </div>

            {/* Под-выбор платформы — только когда вид «Онлайн» включён */}
            {onlineConfig.enabled && (
              <div className="flex items-center gap-4 pl-[3.25rem] flex-wrap">
                {ONLINE_PLATFORMS.map(platform => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setOnlinePlatform(platform)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors",
                      onlineConfig.method === platform
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className={cn(
                      "size-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                      onlineConfig.method === platform
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/50"
                    )}>
                      {onlineConfig.method === platform && (
                        <span className="size-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    {INTERVIEW_METHOD_LABELS[platform]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Вид 3: В офисе */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors flex-wrap",
              officeConfig.enabled ? "border-border bg-background" : "border-border/60 bg-muted/20"
            )}
          >
            <Switch
              checked={officeConfig.enabled}
              onCheckedChange={() => toggleMethod("office")}
              className="shrink-0"
            />
            <span className={cn("text-sm flex-1", !officeConfig.enabled && "text-muted-foreground")}>
              В офисе
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Длит.</span>
              <Select
                value={String(officeConfig.duration)}
                onValueChange={val => setMethodDuration("office", parseInt(val, 10))}
                disabled={!officeConfig.enabled}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs bg-[var(--input-bg)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFICE_DURATION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Буфер</span>
              <Select
                value={String(officeConfig.buffer)}
                onValueChange={val => setMethodBuffer("office", parseInt(val, 10))}
                disabled={!officeConfig.enabled}
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

            {officeConfig.enabled && (
              <button
                type="button"
                onClick={() => setDefaultMethod("office")}
                className={cn(
                  "flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors",
                  defaultMethod === "office"
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn(
                  "size-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                  defaultMethod === "office"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/50"
                )}>
                  {defaultMethod === "office" && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                По умолчанию
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground pt-1">
            Выключенный вид не предлагается кандидатам и в планировщике.
          </p>

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

      {/* Блок 2: Личный Zoom — статус, подключение в Профиле */}
      <ZoomStatusPlate />

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

      {/* Блок 4: Telegram-бот менеджера — общий компонент (тот же в Профиле) */}
      <ManagerReminderBotCard />

      {/* Блок 5: Напоминания — 4 настраиваемых порога (Юрий 09.07) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />Напоминания
          </CardTitle>
          <CardDescription>Автоматические уведомления об интервью — кандидату, HR-каналу и менеджеру (если подключил Telegram выше)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">За 24 часа до интервью</p>
              <p className="text-xs text-muted-foreground">Только если интервью назначено больше чем за 36 часов — иначе рубежа «ровно сутки» ещё не было</p>
            </div>
            <Switch checked={remind24h} onCheckedChange={setRemind24h} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Утром в день интервью</p>
              <p className="text-xs text-muted-foreground">В 9:00 по часовому поясу вакансии, если встреча ещё впереди</p>
            </div>
            <Switch checked={remindMorning} onCheckedChange={setRemindMorning} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">За 1 час до интервью</p>
            </div>
            <Switch checked={remind1h} onCheckedChange={setRemind1h} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">За 15 минут до интервью</p>
            </div>
            <Switch checked={remind15m} onCheckedChange={setRemind15m} />
          </div>

          {/* Тексты напоминаний — кандидату (основное), HR/менеджер — второй секцией */}
          <div className="pt-3 border-t">
            <p className="text-sm font-medium mb-1">Тексты — кандидату</p>
            <p className="text-xs text-muted-foreground mb-3">
              Сообщение в hh-чат кандидату на каждый порог. Пусто — используется стандартный текст (виден подсказкой в поле).
            </p>
            <ReminderTextsChannelSection
              channel="candidate"
              texts={reminderTexts?.candidate}
              onFieldChange={(kind, value) => setReminderTextField("candidate", kind, value)}
            />
          </div>

          <Accordion type="single" collapsible className="pt-1">
            <AccordionItem value="hr">
              <AccordionTrigger className="text-sm font-medium py-2">Тексты — HR-каналу (необязательно)</AccordionTrigger>
              <AccordionContent>
                <ReminderTextsChannelSection
                  channel="hr"
                  texts={reminderTexts?.hr}
                  onFieldChange={(kind, value) => setReminderTextField("hr", kind, value)}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="manager">
              <AccordionTrigger className="text-sm font-medium py-2">Тексты — менеджеру (необязательно)</AccordionTrigger>
              <AccordionContent>
                <ReminderTextsChannelSection
                  channel="manager"
                  texts={reminderTexts?.manager}
                  onFieldChange={(kind, value) => setReminderTextField("manager", kind, value)}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Блок 6: Интеграции календарей (заглушка, только для platformAdmin) */}
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

      {/* Кнопка сохранения */}
      <div className="flex justify-end sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t -mx-1 px-1">
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
