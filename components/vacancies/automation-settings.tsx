"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import {
  MessageSquare, Clock, Zap, Phone, Brain, Send, GripVertical,
  ChevronDown, ChevronUp, Pencil, Check, X, Pause, GitBranch,
  FileText, BarChart3, Video, ClipboardList, Award, UserX,
  Bot, Sparkles, Truck, Users, ChevronRight, Loader2,
} from "lucide-react"

// ─── Типы ────────────────────────────────────────────────────

type MessageTone = "official" | "casual" | "custom"
type ResponseReaction = "slot-and-demo" | "slot-only" | "insist-demo"
type FollowUpPreset = "off" | "min" | "medium" | "max"

interface TouchPoint {
  id: string
  day: number
  label: string
  description: string
  template: string
  enabled: boolean
}

export type ScenarioType = "demo-call" | "call-demo" | "call-only" | "fast-hire" | "ai-smart"

type StepType = "message" | "demo" | "questionnaire" | "scoring" | "call" | "interview" | "pause" | "condition" | "offer" | "reject"

// ─── Данные по-умолчанию ─────────────────────────────────────

const DEFAULT_FIRST_MESSAGE = `[Имя], привет! Видели ваш отклик на [должность] — выглядит интересно 👋
Чтобы не тратить ваше время на формальное интервью, сделали короткий обзор должности на 15 мин — там реальные цифры дохода и как устроена работа.
Если после просмотра захотите пообщаться — сразу договоримся на звонок 🙂
[ссылка]`

const OFFICIAL_TEMPLATE = `Здравствуйте, [Имя].
Благодарим за отклик на вакансию [должность]. Мы подготовили информационную презентацию о компании и должности (около 15 минут).
Предлагаем вам ознакомиться с материалами по ссылке ниже. После просмотра вы сможете записаться на собеседование.
[ссылка]`

const ALL_TOUCH_POINTS: TouchPoint[] = [
  { id: "t1", day: 1, label: "Повторное сообщение", description: "Тот же канал", template: "[Имя], добрый день! Вчера отправляли вам обзор должности [должность]. Может, не дошло? Вот ссылка: [ссылка] — займёт всего 15 мин 🙂", enabled: true },
  { id: "t2", day: 3, label: "Другой угол — доход", description: "Акцент на заработок", template: "[Имя], хотели уточнить по нашей вакансии. Менеджеры у нас выходят на 120-180К уже через 3 месяца. Чтобы было понятнее — собрали короткий обзор: [ссылка]", enabled: true },
  { id: "t3", day: 7, label: "AI-звонок", description: "Голосовой бот (заглушка)", template: "Добрый день, [Имя]! Звоню из компании по поводу вакансии [должность]. Отправляли вам обзор — удалось посмотреть?", enabled: true },
  { id: "t4", day: 14, label: "Вакансия открыта", description: "Напоминание", template: "[Имя], вакансия [должность] всё ещё открыта. Если актуально — вот обзор: [ссылка]. Если нет — просто скажите, не будем беспокоить.", enabled: true },
  { id: "t5", day: 30, label: "Месяц прошёл", description: "Финальное касание", template: "[Имя], прошёл месяц с вашего отклика. Вакансия [должность] ещё доступна. Понимаем, что планы могут измениться — просто дайте знать, если ещё интересно: [ссылка]", enabled: true },
  { id: "t6", day: 45, label: "Через 1,5 месяца", description: "Мягкий follow-up", template: "[Имя], возвращаемся к вашему отклику. У нас обновились условия — стоит посмотреть: [ссылка]", enabled: true },
  { id: "t7", day: 60, label: "2 месяца", description: "Последний шанс", template: "[Имя], мы скоро закрываем вакансию [должность]. Если всё ещё рассматриваете — самое время: [ссылка]", enabled: true },
  { id: "t8", day: 90, label: "3 месяца", description: "Архивное", template: "[Имя], давно не общались. Если вдруг вопрос с работой снова актуален — у нас есть интересные позиции. Напишите, расскажем подробнее.", enabled: true },
]

const PRESET_TOUCH_COUNTS: Record<FollowUpPreset, number> = {
  off: 0,
  min: 3,
  medium: 5,
  max: 8,
}

const STEP_META: Record<StepType, { icon: typeof MessageSquare; label: string; color: string }> = {
  message: { icon: MessageSquare, label: "Сообщение", color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800" },
  demo: { icon: Video, label: "Демонстрация", color: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800" },
  questionnaire: { icon: ClipboardList, label: "Анкета", color: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800" },
  scoring: { icon: BarChart3, label: "Скоринг", color: "bg-cyan-500/10 text-cyan-600 border-cyan-200 dark:border-cyan-800" },
  call: { icon: Phone, label: "Звонок", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800" },
  interview: { icon: Users, label: "Интервью", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200 dark:border-indigo-800" },
  pause: { icon: Pause, label: "Пауза", color: "bg-gray-500/10 text-gray-600 border-gray-200 dark:border-gray-800" },
  condition: { icon: GitBranch, label: "Условие", color: "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800" },
  offer: { icon: Award, label: "Оффер", color: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800" },
  reject: { icon: UserX, label: "Отказ", color: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800" },
}

const SCENARIO_PRESETS: Record<ScenarioType, { steps: StepType[]; icon: typeof Video; label: string; desc: string; color: string }> = {
  "demo-call": {
    steps: ["message", "demo", "scoring", "call", "interview", "offer"],
    icon: Video,
    label: "Демонстрация → Звонок",
    desc: "Для продаж — сначала кандидат смотрит демо, затем созвон",
    color: "text-purple-600",
  },
  "call-demo": {
    steps: ["message", "call", "demo", "scoring", "interview", "offer"],
    icon: Phone,
    label: "Звонок → Демонстрация",
    desc: "Для скептиков — сначала короткий звонок, потом демо",
    color: "text-emerald-600",
  },
  "call-only": {
    steps: ["message", "call", "interview", "offer"],
    icon: Phone,
    label: "Только звонок",
    desc: "Топ-менеджмент — без демо, сразу живое общение",
    color: "text-blue-600",
  },
  "fast-hire": {
    steps: ["message", "questionnaire", "scoring", "call", "offer"],
    icon: Truck,
    label: "Быстрый найм",
    desc: "Склад, курьеры — минимум шагов, максимум скорости",
    color: "text-amber-600",
  },
  "ai-smart": {
    steps: ["message", "scoring", "condition", "demo", "call", "interview", "offer"],
    icon: Bot,
    label: "Умный — AI решает по скорингу",
    desc: "Адаптивный — AI подбирает путь кандидата по скорингу",
    color: "text-cyan-600",
  },
}

// ─── Компонент ──────────────────────────────────────────────

interface AutomationSettingsProps {
  vacancyId: string
  descriptionJson?: unknown
}

export function AutomationSettings({ vacancyId, descriptionJson }: AutomationSettingsProps) {
  // Parse initial scenario from descriptionJson
  const initialScenario = (() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      if (dj.scenario && typeof dj.scenario === "string" && dj.scenario in SCENARIO_PRESETS) {
        return dj.scenario as ScenarioType
      }
    }
    return "demo-call" as ScenarioType
  })()

  // Parse automation settings from descriptionJson
  const initialAutomation = (() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      return (dj.automation as Record<string, unknown>) || {}
    }
    return {}
  })()

  // 1. Первое сообщение
  const [tone, setTone] = useState<MessageTone>((initialAutomation.tone as MessageTone) || "casual")
  const [firstMessageDelay, setFirstMessageDelay] = useState(String(initialAutomation.delayMinutes ?? "3"))
  const [firstMessageText, setFirstMessageText] = useState(
    (initialAutomation.firstMessageText as string) || DEFAULT_FIRST_MESSAGE
  )

  // 1b. Рабочие часы
  const initialWH = (initialAutomation.workingHours as { enabled?: boolean; from?: string; to?: string }) || {}
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(initialWH.enabled ?? false)
  const [workingHoursFrom, setWorkingHoursFrom] = useState(initialWH.from || "09:00")
  const [workingHoursTo, setWorkingHoursTo] = useState(initialWH.to || "20:00")
  const [includeWeekends, setIncludeWeekends] = useState((initialWH as Record<string, unknown>).includeWeekends as boolean ?? false)

  // 2. Обработка ответа
  const [responseReaction, setResponseReaction] = useState<ResponseReaction>(
    (initialAutomation.responseReaction as ResponseReaction) || "slot-and-demo"
  )

  // 3. Цепочка дожима
  const [followUpEnabled, setFollowUpEnabled] = useState<boolean>(
    (initialAutomation.followUpEnabled as boolean) ?? false
  )
  const [followUpPreset, setFollowUpPreset] = useState<FollowUpPreset>(
    (initialAutomation.followUpPreset as FollowUpPreset) || "medium"
  )
  const [touchPoints, setTouchPoints] = useState<TouchPoint[]>(ALL_TOUCH_POINTS)
  const [stopOnNo, setStopOnNo] = useState((initialAutomation.stopOnNo as boolean) ?? true)
  const [stopOnClose, setStopOnClose] = useState((initialAutomation.stopOnClose as boolean) ?? true)
  const [editingTouch, setEditingTouch] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")

  // 4. Сценарий
  const [scenarioType, setScenarioType] = useState<ScenarioType>(initialScenario)
  const [saving, setSaving] = useState(false)

  // Sync if descriptionJson changes externally
  useEffect(() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      if (dj.scenario && typeof dj.scenario === "string" && dj.scenario in SCENARIO_PRESETS) {
        setScenarioType(dj.scenario as ScenarioType)
      }
    }
  }, [descriptionJson])

  const activeTouchCount = PRESET_TOUCH_COUNTS[followUpPreset]
  const visibleTouches = touchPoints.slice(0, activeTouchCount)

  const getMessageByTone = (t: MessageTone) => {
    if (t === "official") return OFFICIAL_TEMPLATE
    if (t === "casual") return DEFAULT_FIRST_MESSAGE
    return firstMessageText
  }

  const handleToneChange = (t: MessageTone) => {
    setTone(t)
    if (t !== "custom") setFirstMessageText(getMessageByTone(t))
  }

  const handleScenarioChange = (s: ScenarioType) => {
    setScenarioType(s)
  }

  const startEditTouch = (tp: TouchPoint) => {
    setEditingTouch(tp.id)
    setEditingText(tp.template)
  }

  const saveEditTouch = () => {
    if (!editingTouch) return
    setTouchPoints(prev => prev.map(tp => tp.id === editingTouch ? { ...tp, template: editingText } : tp))
    setEditingTouch(null)
    toast.success("Шаблон сохранён")
  }

  // Save all automation settings to API
  const saveSettings = useCallback(async () => {
    setSaving(true)
    try {
      const currentJson = (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null)
        ? descriptionJson as Record<string, unknown>
        : {}

      const automationData = {
        tone,
        firstMessageText,
        delayMinutes: Number(firstMessageDelay),
        workingHours: {
          enabled: workingHoursEnabled,
          from: workingHoursFrom,
          to: workingHoursTo,
          includeWeekends,
        },
        responseReaction,
        followUpEnabled,
        followUpPreset,
        stopOnNo,
        stopOnClose,
      }

      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description_json: {
            ...currentJson,
            scenario: scenarioType,
            automation: automationData,
          },
        }),
      })

      if (!res.ok) throw new Error("Ошибка сохранения")
      toast.success("Настройки автоматизации сохранены")
    } catch {
      toast.error("Не удалось сохранить настройки")
    } finally {
      setSaving(false)
    }
  }, [vacancyId, scenarioType, descriptionJson, tone, firstMessageText, firstMessageDelay, workingHoursEnabled, workingHoursFrom, workingHoursTo, includeWeekends, responseReaction, followUpEnabled, followUpPreset, stopOnNo, stopOnClose])

  return (
    <div className="space-y-6">
      {/* ═══ 1. Первое сообщение ═══════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            Первое сообщение
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Тон */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Тон сообщения</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "official" as const, label: "Официальный", icon: FileText },
                { value: "casual" as const, label: "Живой", icon: Sparkles },
                { value: "custom" as const, label: "Свой текст", icon: Pencil },
              ]).map(opt => (
                <button
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                    tone === opt.value
                      ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30 text-foreground"
                  )}
                  onClick={() => handleToneChange(opt.value)}
                >
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Задержка */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Задержка после отклика</Label>
              <p className="text-xs text-muted-foreground">Время ожидания перед отправкой первого сообщения</p>
            </div>
            <Select value={firstMessageDelay} onValueChange={setFirstMessageDelay}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Сразу</SelectItem>
                <SelectItem value="1">1 минута</SelectItem>
                <SelectItem value="3">3 минуты</SelectItem>
                <SelectItem value="5">5 минут</SelectItem>
                <SelectItem value="10">10 минут</SelectItem>
                <SelectItem value="15">15 минут</SelectItem>
                <SelectItem value="30">30 минут</SelectItem>
                <SelectItem value="60">60 минут</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Рабочие часы */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Рабочие часы</Label>
                <p className="text-xs text-muted-foreground">Отправлять сообщения только в рабочее время</p>
              </div>
              <Switch checked={workingHoursEnabled} onCheckedChange={setWorkingHoursEnabled} />
            </div>
            {workingHoursEnabled && (
              <div className="space-y-2.5 pl-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground shrink-0">с</Label>
                  <Input
                    type="time"
                    value={workingHoursFrom}
                    onChange={(e) => setWorkingHoursFrom(e.target.value)}
                    className="w-[120px] h-9"
                  />
                  <Label className="text-sm text-muted-foreground shrink-0">до</Label>
                  <Input
                    type="time"
                    value={workingHoursTo}
                    onChange={(e) => setWorkingHoursTo(e.target.value)}
                    className="w-[120px] h-9"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={includeWeekends} onCheckedChange={(v) => setIncludeWeekends(!!v)} />
                  <span className="text-sm">Включая выходные</span>
                </label>
                <p className="text-xs text-muted-foreground">Если кандидат откликнулся в нерабочее время — сообщение уйдёт в начале следующего рабочего дня</p>
              </div>
            )}
          </div>

          {/* Шаблон */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Шаблон сообщения</Label>
            <textarea
              className={cn(
                "w-full border rounded-lg p-3 text-sm resize-none h-36 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed",
                tone !== "custom" && "opacity-70"
              )}
              value={firstMessageText}
              onChange={(e) => { setFirstMessageText(e.target.value); if (tone !== "custom") setTone("custom") }}
              placeholder="Текст первого сообщения..."
            />
            <div className="flex flex-wrap gap-1.5">
              {["[Имя]", "[должность]", "[компания]", "[ссылка]"].map(v => (
                <Badge key={v} variant="outline" className="text-xs cursor-default">{v}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ 2. Если кандидат отвечает ═════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Если кандидат хочет созвониться
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Система определяет намерение по ключевым словам:</p>
            <div className="flex flex-wrap gap-1.5">
              {["созвон", "позвоните", "номер", "телефон", "голос"].map(w => (
                <Badge key={w} variant="secondary" className="text-xs font-mono">{w}</Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Реакция системы</Label>
            <div className="space-y-2">
              {([
                { value: "slot-and-demo" as const, label: "Предложить слот + мягко предложить демо параллельно", desc: "Максимальная конверсия" },
                { value: "slot-only" as const, label: "Сразу дать слот без демо", desc: "Быстрый процесс" },
                { value: "insist-demo" as const, label: "Настоять на демо перед звонком", desc: "Фильтрация немотивированных" },
              ]).map(opt => (
                <button
                  key={opt.value}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                    responseReaction === opt.value
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  )}
                  onClick={() => setResponseReaction(opt.value)}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                    responseReaction === opt.value ? "border-primary" : "border-muted-foreground/40"
                  )}>
                    {responseReaction === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ 3. Цепочка дожима ═════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Цепочка дожима
              {followUpEnabled && followUpPreset !== "off" && (
                <Badge variant="outline" className="ml-2 text-xs">{activeTouchCount} касаний</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="followup-toggle" className="text-xs text-muted-foreground cursor-pointer">
                {followUpEnabled ? "Включено" : "Выключено"}
              </Label>
              <Switch id="followup-toggle" checked={followUpEnabled} onCheckedChange={setFollowUpEnabled} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!followUpEnabled ? (
            <p className="text-sm text-muted-foreground py-2">Выключено. Повторные сообщения отправляться не будут.</p>
          ) : (
          <>
          {/* Пресеты */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Интенсивность</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "off" as const, label: "Выкл", color: "" },
                { value: "min" as const, label: "Мин — 3 касания", color: "text-blue-600" },
                { value: "medium" as const, label: "Средний — 5 касаний", color: "text-amber-600" },
                { value: "max" as const, label: "Макс — 8 касаний", color: "text-red-600" },
              ]).map(opt => (
                <button
                  key={opt.value}
                  className={cn(
                    "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                    followUpPreset === opt.value
                      ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30 text-foreground"
                  )}
                  onClick={() => setFollowUpPreset(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Таблица касаний */}
          {followUpPreset !== "off" && (
            <>
              <div className="space-y-2">
                {visibleTouches.map((tp) => (
                  <div key={tp.id} className={cn(
                    "rounded-lg border transition-all",
                    !tp.enabled && "opacity-50"
                  )}>
                    <div className="flex items-center gap-3 p-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-muted-foreground">Д{tp.day}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{tp.label}</span>
                          <span className="text-xs text-muted-foreground">· {tp.description}</span>
                        </div>
                        {editingTouch === tp.id ? (
                          <div className="mt-2 space-y-2">
                            <textarea
                              className="w-full border rounded-lg p-2.5 text-xs resize-none h-20 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                            />
                            <div className="flex items-center gap-2">
                              <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEditTouch}>
                                <Check className="w-3 h-3" /> Сохранить
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEditingTouch(null)}>
                                <X className="w-3 h-3" /> Отмена
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tp.template}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditTouch(tp)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Switch
                          checked={tp.enabled}
                          onCheckedChange={(v) => setTouchPoints(prev => prev.map(t => t.id === tp.id ? { ...t, enabled: v } : t))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Переключатели */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Остановить если ответил «нет»</Label>
                    <p className="text-xs text-muted-foreground">Прекратить касания после отказа</p>
                  </div>
                  <Switch checked={stopOnNo} onCheckedChange={setStopOnNo} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Остановить если вакансия закрыта</Label>
                    <p className="text-xs text-muted-foreground">Не отправлять если вакансия в архиве</p>
                  </div>
                  <Switch checked={stopOnClose} onCheckedChange={setStopOnClose} />
                </div>
              </div>
            </>
          )}
          </>
          )}
        </CardContent>
      </Card>

      {/* ═══ 4. Сценарий найма ═════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            Сценарий найма
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {(Object.entries(SCENARIO_PRESETS) as [ScenarioType, typeof SCENARIO_PRESETS[ScenarioType]][]).map(([key, preset]) => {
              const Icon = preset.icon
              const isSelected = scenarioType === key
              return (
                <button
                  key={key}
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  )}
                  onClick={() => handleScenarioChange(key)}
                >
                  <div className="flex items-start gap-3">
                    {/* Radio circle */}
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                      isSelected ? "border-primary" : "border-muted-foreground/40"
                    )}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>

                    {/* Icon */}
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", isSelected ? "bg-primary/10" : "bg-muted")}>
                      <Icon className={cn("w-4 h-4", preset.color)} />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{preset.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{preset.desc}</p>

                      {/* Horizontal step chain */}
                      <div className="flex flex-wrap items-center gap-1 mt-3">
                        {preset.steps.map((step, idx) => {
                          const meta = STEP_META[step]
                          const StepIcon = meta.icon
                          return (
                            <div key={`${step}-${idx}`} className="flex items-center gap-1">
                              <div className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium",
                                meta.color
                              )}>
                                <StepIcon className="w-3 h-3 shrink-0" />
                                {meta.label}
                              </div>
                              {idx < preset.steps.length - 1 && (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      <div className="flex justify-end mt-3">
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Сохранить настройки
        </Button>
      </div>
    </div>
  )
}
