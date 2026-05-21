"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { renderTemplate } from "@/lib/template-renderer"
import {
  CheckCircle2, Calendar, Phone, Video, Building2,
  Sparkles, Clock, Play, XCircle, ChevronDown, ClipboardList,
  Send,
} from "lucide-react"
import { useVacancySectionRegister } from "./vacancy-settings-context"

type PostDemoMode = "auto" | "manual"

type FormFieldKey = "firstName" | "lastName" | "email" | "phone" | "telegram" | "birthDate" | "city"
type FormFieldsState = Record<FormFieldKey, { enabled: boolean; required: boolean }>

const DEFAULT_FORM_FIELDS: FormFieldsState = {
  firstName: { enabled: true, required: true },
  lastName:  { enabled: true, required: true },
  email:     { enabled: true, required: true },
  phone:     { enabled: true, required: true },
  telegram:  { enabled: true, required: false },
  birthDate: { enabled: true, required: false },
  city:      { enabled: true, required: false },
}

const FIELD_LABELS: Record<FormFieldKey, string> = {
  firstName: "Имя",
  lastName:  "Фамилия",
  email:     "Email",
  phone:     "Телефон",
  telegram:  "Telegram",
  birthDate: "Дата рождения",
  city:      "Город",
}

const FIELD_ORDER: FormFieldKey[] = ["firstName", "lastName", "email", "phone", "telegram", "birthDate", "city"]

export type PostDemoSection = "thresholds" | "formFields" | "preview" | "anketaAutoReply"

type AnketaAutoReplyDelay = 5 | 15 | 30 | 60 | 240 | 1440
const ANKETA_DELAYS: { value: AnketaAutoReplyDelay; label: string }[] = [
  { value: 5,    label: "5 минут" },
  { value: 15,   label: "15 минут" },
  { value: 30,   label: "30 минут" },
  { value: 60,   label: "1 час" },
  { value: 240,  label: "4 часа" },
  { value: 1440, label: "24 часа" },
]
const DEFAULT_ANKETA_AUTO_REPLY_TEXT =
  "{{name}}, рассмотрели вашу анкету. Ваша кандидатура нам интересна. Предлагаем тестовое задание."

interface PostDemoSettingsProps {
  vacancyId: string
  /**
   * Какие карточки показывать. Если не задано — все 3 как раньше.
   * Ф5: в табе «AI и автоматизация» → ["thresholds", "preview"],
   * в табе «Анкета» → ["formFields"]. Все инстансы используют общий API
   * /api/modules/hr/vacancies/[id]/post-demo-settings, merge на бэкенде.
   */
  sections?: PostDemoSection[]
}

export function PostDemoSettings({ vacancyId, sections }: PostDemoSettingsProps) {
  const showSection = (id: PostDemoSection) => !sections || sections.includes(id)
  // ТЗ-1 Часть 5 (P0-17) + Часть 8 (P0-19b): новые вакансии стартуют с enabled=false, mode=manual.
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<PostDemoMode>("manual")

  // Thresholds
  const [upperThreshold, setUpperThreshold] = useState(75)
  const [lowerThreshold, setLowerThreshold] = useState(50)

  // Green level (>= upper)
  const [greenTitle, setGreenTitle] = useState("Отлично! Выберите удобное время для встречи")
  const [meetPhone, setMeetPhone] = useState(true)
  const [meetOnline, setMeetOnline] = useState(true)
  const [meetOffice, setMeetOffice] = useState(false)
  const [officeAddress, setOfficeAddress] = useState("")
  const [greenOpen, setGreenOpen] = useState(true)

  // Yellow level (lower <= score < upper)
  const [yellowTitle, setYellowTitle] = useState("Спасибо за прохождение!")
  const [yellowText, setYellowText] = useState("Мы рассмотрим вашу анкету и свяжемся с вами в ближайшее время")
  const [yellowOpen, setYellowOpen] = useState(false)

  // Red level (< lower)
  const [redTitle, setRedTitle] = useState("Спасибо за интерес к вакансии")
  const [redText, setRedText] = useState("К сожалению, ваш профиль не соответствует требованиям данной позиции. Мы сохраним ваши данные и свяжемся, если появится подходящая вакансия.")
  const [redOpen, setRedOpen] = useState(false)

  // Manual mode
  const [manualTitle, setManualTitle] = useState("Отлично, {{name}}! Вы прошли демонстрацию 🎉")
  const [manualText, setManualText] = useState("Мы изучим ваши ответы и свяжемся с вами в ближайшее время")
  const [manualButton, setManualButton] = useState("Хорошо, жду!")
  const [manualButtonEnabled, setManualButtonEnabled] = useState(true)

  // Final form fields
  const [formFields, setFormFields] = useState<FormFieldsState>(DEFAULT_FORM_FIELDS)

  // ТЗ-3 Ч.1: автоответ после заполнения анкеты
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoReplyDelay, setAutoReplyDelay] = useState<AnketaAutoReplyDelay>(60)
  const [autoReplyRespectSchedule, setAutoReplyRespectSchedule] = useState(true)
  const [autoReplyText, setAutoReplyText] = useState(DEFAULT_ANKETA_AUTO_REPLY_TEXT)
  const [autoReplyTestTaskUrl, setAutoReplyTestTaskUrl] = useState("")

  // Preview
  const [previewScore, setPreviewScore] = useState(80)
  const previewLevel = previewScore >= upperThreshold ? "green" : previewScore >= lowerThreshold ? "yellow" : "red"

  // Saving state
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load saved settings on mount
  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/post-demo-settings`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return
        if (!json) { setLoaded(true); return }
        const data = json.settings ?? {}
        if (!data || typeof data !== "object") return
        if (typeof data.enabled === "boolean") setEnabled(data.enabled)
        if (data.mode === "auto" || data.mode === "manual") setMode(data.mode)
        if (typeof data.upperThreshold === "number") setUpperThreshold(data.upperThreshold)
        if (typeof data.lowerThreshold === "number") setLowerThreshold(data.lowerThreshold)
        if (typeof data.greenTitle === "string") setGreenTitle(data.greenTitle)
        if (typeof data.meetPhone === "boolean") setMeetPhone(data.meetPhone)
        if (typeof data.meetOnline === "boolean") setMeetOnline(data.meetOnline)
        if (typeof data.meetOffice === "boolean") setMeetOffice(data.meetOffice)
        if (typeof data.officeAddress === "string") setOfficeAddress(data.officeAddress)
        if (typeof data.yellowTitle === "string") setYellowTitle(data.yellowTitle)
        if (typeof data.yellowText === "string") setYellowText(data.yellowText)
        if (typeof data.redTitle === "string") setRedTitle(data.redTitle)
        if (typeof data.redText === "string") setRedText(data.redText)
        if (typeof data.manualTitle === "string") setManualTitle(data.manualTitle)
        if (typeof data.manualText === "string") setManualText(data.manualText)
        if (typeof data.manualButton === "string") setManualButton(data.manualButton)
        if (typeof data.manualButtonEnabled === "boolean") setManualButtonEnabled(data.manualButtonEnabled)
        if (data.anketaAutoReply && typeof data.anketaAutoReply === "object") {
          const ar = data.anketaAutoReply as Record<string, unknown>
          if (typeof ar.enabled === "boolean") setAutoReplyEnabled(ar.enabled)
          if (typeof ar.delayMinutes === "number" && ANKETA_DELAYS.some(d => d.value === ar.delayMinutes)) {
            setAutoReplyDelay(ar.delayMinutes as AnketaAutoReplyDelay)
          }
          if (typeof ar.respectSchedule === "boolean") setAutoReplyRespectSchedule(ar.respectSchedule)
          if (typeof ar.text === "string") setAutoReplyText(ar.text)
          if (typeof ar.testTaskUrl === "string") setAutoReplyTestTaskUrl(ar.testTaskUrl)
        }
        if (data.formFields && typeof data.formFields === "object") {
          const merged: FormFieldsState = { ...DEFAULT_FORM_FIELDS }
          for (const key of FIELD_ORDER) {
            const f = (data.formFields as Record<string, unknown>)[key]
            if (f && typeof f === "object") {
              const ff = f as { enabled?: unknown; required?: unknown }
              merged[key] = {
                enabled: typeof ff.enabled === "boolean" ? ff.enabled : merged[key].enabled,
                required: typeof ff.required === "boolean" ? ff.required : merged[key].required,
              }
            }
          }
          setFormFields(merged)
        }
      })
      .catch(err => console.error("[post-demo load]", err))
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Keep thresholds in sync
  const handleUpperChange = (v: number) => {
    setUpperThreshold(v)
    if (v <= lowerThreshold) setLowerThreshold(Math.max(0, v - 5))
  }
  const handleLowerChange = (v: number) => {
    setLowerThreshold(v)
    if (v >= upperThreshold) setUpperThreshold(Math.min(100, v + 5))
  }

  const handleSave = async () => {
    if (!vacancyId) return
    setSaving(true)
    try {
      const payload = {
        enabled,
        mode,
        upperThreshold,
        lowerThreshold,
        greenTitle,
        meetPhone,
        meetOnline,
        meetOffice,
        officeAddress,
        yellowTitle,
        yellowText,
        redTitle,
        redText,
        manualTitle,
        manualText,
        manualButton,
        manualButtonEnabled,
        formFields,
        anketaAutoReply: {
          enabled:         autoReplyEnabled,
          delayMinutes:    autoReplyDelay,
          respectSchedule: autoReplyRespectSchedule,
          text:            autoReplyText,
          testTaskUrl:     autoReplyTestTaskUrl,
        },
      }
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/post-demo-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("save failed")
      toast.success("Настройки сохранены")
    } catch (err) {
      console.error("[post-demo save]", err)
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  // ТЗ-1 Часть 2: регистрируем сохранение в общем контексте sticky-кнопки.
  // Все секции (thresholds + formFields + preview) шлются одним PUT'ом → одна регистрация.
  useVacancySectionRegister({
    sectionKey: `post-demo:${vacancyId}`,
    tabKey: "funnel",
    loaded,
    watchedValues: {
      enabled, mode, upperThreshold, lowerThreshold,
      greenTitle, meetPhone, meetOnline, meetOffice, officeAddress,
      yellowTitle, yellowText, redTitle, redText,
      manualTitle, manualText, manualButton, manualButtonEnabled,
      formFields,
    },
    save: handleSave,
  })
  void saving // saving остаётся для возможной локальной индикации; основная — в sticky bar.

  return (
    <div className="space-y-6">
      {showSection("thresholds") && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="w-4 h-4" />
              После демонстрации
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{enabled ? "Включено" : "Выключено"}</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          {/* ТЗ-1 Часть 7 (P0-23): подсказка только когда блок выключен. */}
          {!enabled && (
            <p className="text-[11px] text-muted-foreground mt-2 bg-muted/40 rounded-md px-3 py-2 border">
              Блок выключен. Кандидат после демо видит стандартный экран благодарности.
            </p>
          )}
        </CardHeader>
        <CardContent className={cn("space-y-5", !enabled && "opacity-50 pointer-events-none")}>
          {/* Mode selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Режим</Label>
            <div className="space-y-2">
              {([
                { value: "auto" as const, label: "Автоматический", desc: "Кандидат сам записывается на интервью по порогу AI-скоринга", disabled: true },
                { value: "manual" as const, label: "Ручной", desc: "HR связывается сам после просмотра результатов", disabled: false },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  title={opt.disabled ? "Скоро будет доступно" : undefined}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                    mode === opt.value ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30",
                    opt.disabled && "opacity-50 cursor-not-allowed hover:border-border"
                  )}
                  onClick={() => { if (!opt.disabled) setMode(opt.value) }}
                >
                  <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center", mode === opt.value ? "border-primary" : "border-muted-foreground/40")}>
                    {mode === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {opt.label}
                      {opt.disabled && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">Скоро</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Auto mode settings */}
          {mode === "auto" && (
            <div className="space-y-5">
              {/* Thresholds */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Пороги после демо
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Эти пороги применяются к результатам прохождения демонстрации, не к оценке резюме. Для скоринга резюме см. таб «Дожим» → блок «AI-фильтр откликов».
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Верхний порог (зелёный)</span>
                    <span className="text-sm font-bold text-emerald-600">{upperThreshold}%</span>
                  </div>
                  <Slider value={[upperThreshold]} onValueChange={([v]) => handleUpperChange(v)} min={10} max={100} step={5} className="w-full" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Нижний порог (жёлтый)</span>
                    <span className="text-sm font-bold text-amber-600">{lowerThreshold}%</span>
                  </div>
                  <Slider value={[lowerThreshold]} onValueChange={([v]) => handleLowerChange(v)} min={0} max={95} step={5} className="w-full" />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥{upperThreshold}%</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {lowerThreshold}–{upperThreshold - 1}%</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {"<"}{lowerThreshold}%</span>
                </div>
              </div>

              <Separator />

              {/* Green level */}
              <Collapsible open={greenOpen} onOpenChange={setGreenOpen}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Отличный кандидат</span>
                      <span className="text-xs text-emerald-600/70">≥{upperThreshold}%</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-emerald-600 transition-transform", greenOpen && "rotate-180")} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 border-2 border-t-0 border-emerald-200 dark:border-emerald-800 rounded-b-lg space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Заголовок</Label>
                      <Input value={greenTitle} onChange={e => setGreenTitle(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Доступные типы встречи</Label>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={meetPhone} onCheckedChange={v => setMeetPhone(!!v)} />
                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">Звонок (телефон)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={meetOnline} onCheckedChange={v => setMeetOnline(!!v)} />
                          <Video className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">Онлайн (Zoom / Телемост)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={meetOffice} onCheckedChange={v => setMeetOffice(!!v)} />
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">Офис</span>
                        </label>
                        {meetOffice && (
                          <Input value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} placeholder="Адрес офиса" className="h-8 text-sm ml-6 w-[calc(100%-24px)]" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Действие: показать планировщик слотов для записи на интервью</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Yellow level */}
              <Collapsible open={yellowOpen} onOpenChange={setYellowOpen}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Средний кандидат</span>
                      <span className="text-xs text-amber-600/70">{lowerThreshold}–{upperThreshold - 1}%</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-amber-600 transition-transform", yellowOpen && "rotate-180")} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 border-2 border-t-0 border-amber-200 dark:border-amber-800 rounded-b-lg space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Заголовок</Label>
                      <Input value={yellowTitle} onChange={e => setYellowTitle(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Текст</Label>
                      <textarea className="w-full border rounded-lg p-2 text-sm resize-none h-16 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" value={yellowText} onChange={e => setYellowText(e.target.value)} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Red level */}
              <Collapsible open={redOpen} onOpenChange={setRedOpen}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 rounded-lg border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-semibold text-red-700 dark:text-red-400">Не подходит</span>
                      <span className="text-xs text-red-600/70">{"<"}{lowerThreshold}%</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-red-600 transition-transform", redOpen && "rotate-180")} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 border-2 border-t-0 border-red-200 dark:border-red-800 rounded-b-lg space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Заголовок</Label>
                      <Input value={redTitle} onChange={e => setRedTitle(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Текст</Label>
                      <textarea className="w-full border rounded-lg p-2 text-sm resize-none h-20 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" value={redText} onChange={e => setRedText(e.target.value)} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Manual mode settings */}
          {mode === "manual" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Заголовок</Label>
                <Input value={manualTitle} onChange={e => setManualTitle(e.target.value)} className="h-8 text-sm" />
                <p className="text-[10px] text-muted-foreground">{"{{name}}"} подставляется автоматически</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Текст</Label>
                <textarea className="w-full border rounded-lg p-2 text-sm resize-none h-16 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" value={manualText} onChange={e => setManualText(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div>
                  <Label className="text-xs">Показывать кнопку</Label>
                  <p className="text-[10px] text-muted-foreground">Если выключено — после текста ничего не показывается</p>
                </div>
                <Switch checked={manualButtonEnabled} onCheckedChange={setManualButtonEnabled} />
              </div>
              <div className="space-y-2">
                <Label className={cn("text-xs", !manualButtonEnabled && "text-muted-foreground/60")}>Текст кнопки</Label>
                <Input
                  value={manualButton}
                  onChange={e => setManualButton(e.target.value)}
                  disabled={!manualButtonEnabled}
                  className={cn("h-8 text-sm", !manualButtonEnabled && "opacity-50")}
                />
              </div>
            </div>
          )}

          {/* ТЗ-1 Часть 2: локальная «Сохранить» убрана — есть глобальная sticky-кнопка снизу-справа. */}
        </CardContent>
      </Card>
      )}

      {showSection("formFields") && (
      /* Финальная анкета — настройка полей */
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Финальная анкета
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Поля, которые видит кандидат после демо. Можно скрыть и/или сделать необязательными.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 pb-1 text-[11px] text-muted-foreground">
              <span>Поле</span>
              <span className="w-20 text-center">Показывать</span>
              <span className="w-24 text-center">Обязательное</span>
            </div>
            {FIELD_ORDER.map(key => {
              const f = formFields[key]
              return (
                <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-2 rounded-lg border bg-background">
                  <span className="text-sm">{FIELD_LABELS[key]}</span>
                  <div className="w-20 flex justify-center">
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={v => setFormFields(prev => ({
                        ...prev,
                        [key]: { enabled: v, required: v ? prev[key].required : false },
                      }))}
                    />
                  </div>
                  <div className="w-24 flex justify-center">
                    <Switch
                      checked={f.required}
                      disabled={!f.enabled}
                      onCheckedChange={v => setFormFields(prev => ({
                        ...prev,
                        [key]: { ...prev[key], required: v },
                      }))}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {/* ТЗ-1 Часть 2: локальная «Сохранить» убрана — глобальная sticky-кнопка. */}
        </CardContent>
      </Card>
      )}

      {showSection("anketaAutoReply") && (
      /* ТЗ-3 Ч.1: автоответ после заполнения финальной анкеты */
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4" />
                Автоответ после заполнения анкеты
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Когда кандидат сдаёт финальную анкету, бот сам отправит ему сообщение
                в hh-чат — например, с тестовым заданием. HR не разбирает руками.
              </p>
            </div>
            <Switch checked={autoReplyEnabled} onCheckedChange={setAutoReplyEnabled} />
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-4", !autoReplyEnabled && "opacity-60 pointer-events-none")}>
          <div className="space-y-2">
            <Label className="text-xs">Задержка перед отправкой</Label>
            <div className="flex flex-wrap gap-1.5">
              {ANKETA_DELAYS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setAutoReplyDelay(d.value)}
                  className={cn(
                    "h-7 px-2.5 rounded-md border text-xs transition-colors",
                    autoReplyDelay === d.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="text-xs">Учитывать рабочее время вакансии</Label>
              <p className="text-[10px] text-muted-foreground">
                Если кандидат заполнил анкету ночью — отправим утром по расписанию из таба «Расписание».
              </p>
            </div>
            <Switch checked={autoReplyRespectSchedule} onCheckedChange={setAutoReplyRespectSchedule} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Текст сообщения</Label>
            <textarea
              className="w-full border rounded-lg p-2 text-sm resize-none h-20 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={autoReplyText}
              onChange={e => setAutoReplyText(e.target.value.slice(0, 2000))}
            />
            <p className="text-[10px] text-muted-foreground">
              Доступные плейсхолдеры:{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{name}}"}</code>,{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{vacancy}}"}</code>,{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{company}}"}</code>,{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{demo_link}}"}</code>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ссылка на тестовое задание (опционально)</Label>
            <Input
              type="url"
              value={autoReplyTestTaskUrl}
              onChange={e => setAutoReplyTestTaskUrl(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Если указана — будет дописана в конец сообщения отдельной строкой.
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? "Сохранение…" : "Сохранить настройки"}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {showSection("preview") && (
      /* Live preview */
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Превью финального экрана</CardTitle>
          {mode === "auto" && (
            <div className={cn("flex items-center gap-3 mt-2", !enabled && "opacity-50 pointer-events-none")}>
              <Label className="text-xs text-muted-foreground">Тестовый балл:</Label>
              <Slider value={[previewScore]} onValueChange={([v]) => setPreviewScore(v)} min={0} max={100} step={1} className="w-32" />
              <span className={cn("text-sm font-bold", previewLevel === "green" ? "text-emerald-600" : previewLevel === "yellow" ? "text-amber-600" : "text-red-600")}>{previewScore}%</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "#f8fafc" }}>
            <div className="p-6 text-center space-y-4 max-w-sm mx-auto">
              {mode === "auto" ? (
                previewLevel === "green" ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                    <h3 className="text-lg font-bold text-gray-900">{greenTitle}</h3>
                    <div className="space-y-2 text-left">
                      <p className="text-xs text-gray-500">Выберите тип встречи:</p>
                      <div className="space-y-1.5">
                        {meetPhone && <div className="p-2 rounded-lg border text-sm flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Звонок</div>}
                        {meetOnline && <div className="p-2 rounded-lg border text-sm flex items-center gap-2"><Video className="w-4 h-4 text-gray-400" /> Онлайн</div>}
                        {meetOffice && <div className="p-2 rounded-lg border text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" /> Офис</div>}
                      </div>
                    </div>
                    <div className="h-9 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-medium">
                      <Calendar className="w-4 h-4 mr-1.5" /> Выбрать время
                    </div>
                  </>
                ) : previewLevel === "yellow" ? (
                  <>
                    <Clock className="w-12 h-12 text-amber-500 mx-auto" />
                    <h3 className="text-lg font-bold text-gray-900">{yellowTitle}</h3>
                    <p className="text-sm text-gray-500">{yellowText}</p>
                  </>
                ) : (
                  <>
                    <XCircle className="w-12 h-12 text-red-400 mx-auto" />
                    <h3 className="text-lg font-bold text-gray-900">{redTitle}</h3>
                    <p className="text-sm text-gray-500">{redText}</p>
                  </>
                )
              ) : (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h3 className="text-lg font-bold text-gray-900">{renderTemplate(manualTitle, { name: "Иван" })}</h3>
                  <p className="text-sm text-gray-500">{manualText}</p>
                  {manualButtonEnabled && (
                    <div className="h-9 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-medium">
                      {manualButton}
                    </div>
                  )}
                </>
              )}
              <p className="text-[10px] text-gray-300">Powered by Company24</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
