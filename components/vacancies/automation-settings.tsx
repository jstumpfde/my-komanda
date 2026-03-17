"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  MessageSquare, Clock, Zap, Phone, Brain, Send, GripVertical,
  ChevronDown, ChevronUp, Pencil, Check, X, Pause, GitBranch,
  FileText, BarChart3, Video, ClipboardList, Award, UserX,
  Bot, Sparkles, Truck, Users,
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

type ScenarioType = "demo-call" | "call-demo" | "call-only" | "fast-hire" | "ai-smart" | "custom"

interface ScenarioStep {
  id: string
  type: StepType
  label: string
  icon: string
}

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
  message: { icon: MessageSquare, label: "Сообщение", color: "bg-blue-500/10 text-blue-600" },
  demo: { icon: Video, label: "Демонстрация", color: "bg-purple-500/10 text-purple-600" },
  questionnaire: { icon: ClipboardList, label: "Анкета", color: "bg-amber-500/10 text-amber-600" },
  scoring: { icon: BarChart3, label: "Скоринг", color: "bg-cyan-500/10 text-cyan-600" },
  call: { icon: Phone, label: "Звонок", color: "bg-emerald-500/10 text-emerald-600" },
  interview: { icon: Users, label: "Интервью", color: "bg-indigo-500/10 text-indigo-600" },
  pause: { icon: Pause, label: "Пауза", color: "bg-gray-500/10 text-gray-600" },
  condition: { icon: GitBranch, label: "Условие", color: "bg-orange-500/10 text-orange-600" },
  offer: { icon: Award, label: "Оффер", color: "bg-green-500/10 text-green-600" },
  reject: { icon: UserX, label: "Отказ", color: "bg-red-500/10 text-red-600" },
}

const SCENARIO_PRESETS: Record<Exclude<ScenarioType, "custom">, StepType[]> = {
  "demo-call": ["message", "demo", "scoring", "call", "interview", "offer"],
  "call-demo": ["message", "call", "demo", "scoring", "interview", "offer"],
  "call-only": ["message", "call", "interview", "offer"],
  "fast-hire": ["message", "questionnaire", "scoring", "call", "offer"],
  "ai-smart": ["message", "scoring", "condition", "demo", "call", "interview", "offer"],
}

// ─── Компонент ──────────────────────────────────────────────

export function AutomationSettings() {
  // 1. Первое сообщение
  const [tone, setTone] = useState<MessageTone>("casual")
  const [firstMessageDelay, setFirstMessageDelay] = useState("3")
  const [firstMessageText, setFirstMessageText] = useState(DEFAULT_FIRST_MESSAGE)

  // 2. Обработка ответа
  const [responseReaction, setResponseReaction] = useState<ResponseReaction>("slot-and-demo")

  // 3. Цепочка дожима
  const [followUpPreset, setFollowUpPreset] = useState<FollowUpPreset>("medium")
  const [touchPoints, setTouchPoints] = useState<TouchPoint[]>(ALL_TOUCH_POINTS)
  const [stopOnNo, setStopOnNo] = useState(true)
  const [stopOnClose, setStopOnClose] = useState(true)
  const [editingTouch, setEditingTouch] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")

  // 4. Конструктор сценария
  const [scenarioType, setScenarioType] = useState<ScenarioType>("demo-call")
  const [customSteps, setCustomSteps] = useState<StepType[]>(SCENARIO_PRESETS["demo-call"])
  const [dragIdx, setDragIdx] = useState<number | null>(null)

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
    if (s !== "custom") setCustomSteps(SCENARIO_PRESETS[s])
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

  // drag-n-drop для кастомного сценария
  const handleStepDragStart = (idx: number) => setDragIdx(idx)
  const handleStepDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const next = [...customSteps]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    setCustomSteps(next)
    setDragIdx(idx)
  }
  const handleStepDragEnd = () => setDragIdx(null)

  const addStep = (type: StepType) => {
    setCustomSteps(prev => [...prev, type])
  }

  const removeStep = (idx: number) => {
    setCustomSteps(prev => prev.filter((_, i) => i !== idx))
  }

  const activeSteps = scenarioType === "custom" ? customSteps : (SCENARIO_PRESETS[scenarioType] || [])

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
                <SelectItem value="1">1 минута</SelectItem>
                <SelectItem value="3">3 минуты</SelectItem>
                <SelectItem value="5">5 минут</SelectItem>
                <SelectItem value="10">10 минут</SelectItem>
                <SelectItem value="15">15 минут</SelectItem>
                <SelectItem value="30">30 минут</SelectItem>
              </SelectContent>
            </Select>
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
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Цепочка дожима
            {followUpPreset !== "off" && (
              <Badge variant="outline" className="ml-2 text-xs">{activeTouchCount} касаний</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
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
                {visibleTouches.map((tp, idx) => (
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
        </CardContent>
      </Card>

      {/* ═══ 4. Конструктор сценария ═══════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            Конструктор сценария
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Готовые сценарии */}
          <div className="space-y-2">
            {([
              { value: "demo-call" as const, icon: Video, label: "Демонстрация → Звонок", desc: "Для продаж", color: "text-purple-600" },
              { value: "call-demo" as const, icon: Phone, label: "Звонок → Демонстрация", desc: "Для скептиков", color: "text-emerald-600" },
              { value: "call-only" as const, icon: Phone, label: "Только звонок", desc: "Топ-менеджмент", color: "text-blue-600" },
              { value: "fast-hire" as const, icon: Truck, label: "Быстрый найм", desc: "Склад, курьеры", color: "text-amber-600" },
              { value: "ai-smart" as const, icon: Bot, label: "Умный — AI решает по скорингу", desc: "Адаптивный", color: "text-cyan-600" },
              { value: "custom" as const, icon: Pencil, label: "Свой сценарий", desc: "Настройте шаги вручную", color: "text-foreground" },
            ]).map(opt => (
              <button
                key={opt.value}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                  scenarioType === opt.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
                onClick={() => handleScenarioChange(opt.value)}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                  scenarioType === opt.value ? "border-primary" : "border-muted-foreground/40"
                )}>
                  {scenarioType === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <opt.icon className={cn("w-4 h-4 shrink-0", opt.color)} />
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{opt.desc}</span>
                </div>
              </button>
            ))}
          </div>

          <Separator />

          {/* Визуализация шагов сценария */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Шаги сценария</Label>
            <div className="space-y-1.5">
              {activeSteps.map((step, idx) => {
                const meta = STEP_META[step]
                const Icon = meta.icon
                return (
                  <div
                    key={`${step}-${idx}`}
                    draggable={scenarioType === "custom"}
                    onDragStart={() => handleStepDragStart(idx)}
                    onDragOver={(e) => handleStepDragOver(e, idx)}
                    onDragEnd={handleStepDragEnd}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg border bg-card transition-all",
                      scenarioType === "custom" && "cursor-grab active:cursor-grabbing hover:border-primary/30",
                      dragIdx === idx && "opacity-40 scale-95"
                    )}
                  >
                    {scenarioType === "custom" && (
                      <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                      <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0", meta.color)}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span>{meta.label}</span>
                    </div>
                    {scenarioType === "custom" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStep(idx)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                    {idx < activeSteps.length - 1 && (
                      <div className="hidden" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Добавить шаг (только для кастомного) */}
          {scenarioType === "custom" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Добавить шаг</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STEP_META) as StepType[]).map(type => {
                  const meta = STEP_META[type]
                  const Icon = meta.icon
                  return (
                    <button
                      key={type}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed text-xs font-medium transition-all hover:border-primary/50 hover:bg-primary/5",
                        meta.color
                      )}
                      onClick={() => addStep(type)}
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      <div className="flex justify-end">
        <Button className="gap-2" onClick={() => toast.success("Настройки автоматизации сохранены")}>
          <Check className="w-4 h-4" />
          Сохранить настройки
        </Button>
      </div>
    </div>
  )
}
