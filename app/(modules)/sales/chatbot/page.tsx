"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { toast } from "sonner"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bot,
  Send,
  Loader2,
  Settings2,
  FlaskConical,
  Save,
  Star,
  Trash2,
  BookmarkPlus,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { SalesChatbotSettings, TimePickingMode } from "@/lib/ai/sales-chatbot-settings"

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

interface ChatbotConfig {
  isEnabled: boolean
  botName: string
  greeting: string
  systemPrompt: string
  settings: SalesChatbotSettings
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  action?: string
  category?: string
  confidence?: number
  escalationReason?: string
  isLoading?: boolean
}

interface Preset {
  id: string
  name: string
  isDefault: boolean
  settings: SalesChatbotSettings
}

// ---------------------------------------------------------------------------
// Утилита
// ---------------------------------------------------------------------------

function uid() {
  return Math.random().toString(36).slice(2)
}

// ---------------------------------------------------------------------------
// Компонент «Действие ответа» — бэдж под сообщением бота
// ---------------------------------------------------------------------------

interface ResponseBadgesProps {
  action?: string
  category?: string
  confidence?: number
  escalationReason?: string
}

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  reply:        { label: "Ответ",       variant: "default" },
  escalate:     { label: "Эскалация",   variant: "destructive" },
  ignore:       { label: "Игнор",       variant: "secondary" },
  needs_review: { label: "На проверку", variant: "outline" },
}

function ResponseBadges({ action, category, confidence, escalationReason }: ResponseBadgesProps) {
  if (!action && !category) return null

  const actionMeta = action ? (ACTION_LABELS[action] ?? { label: action, variant: "secondary" as const }) : null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/40">
      {actionMeta && (
        <Badge variant={actionMeta.variant} className="text-[10px] h-4 px-1.5">
          {actionMeta.label}
        </Badge>
      )}
      {category && (
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
          {category}
        </Badge>
      )}
      {confidence !== undefined && (
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
          {Math.round(confidence * 100)}%
        </Badge>
      )}
      {escalationReason && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={escalationReason}>
          {escalationReason}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Главная страница
// ---------------------------------------------------------------------------

export default function SalesChatbotPage() {
  // --- Состояние конфига ---
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [isEnabled, setIsEnabled] = useState(true)
  const [botName, setBotName] = useState("")
  const [greeting, setGreeting] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")

  // Поведение
  const [timePickingMode, setTimePickingMode] = useState<TimePickingMode>("hybrid")
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [followUpEnabled, setFollowUpEnabled] = useState(true)
  const [firstTouchMinutes, setFirstTouchMinutes] = useState(90)
  const [secondTouchHours, setSecondTouchHours] = useState(24)
  const [maxTouches, setMaxTouches] = useState(3)
  const [escalationOnRequest, setEscalationOnRequest] = useState(true)
  const [delaySeconds, setDelaySeconds] = useState(10)
  const [enableShortMessages, setEnableShortMessages] = useState(false)
  const [shortToMainDelaySeconds, setShortToMainDelaySeconds] = useState(8)

  // --- Ночной режим ---
  const [nightModeEnabled, setNightModeEnabled] = useState(true)
  const [nightModeStartHour, setNightModeStartHour] = useState(22)
  const [nightModeEndHour, setNightModeEndHour] = useState(9)
  const [nightModeMode, setNightModeMode] = useState<"instant_ack" | "full_reply">("instant_ack")
  const [nightModeAckMessage, setNightModeAckMessage] = useState(
    "Здравствуйте! Сейчас нерабочее время, но я уже могу записать вас — подскажите услугу и удобное время."
  )

  // --- Задержка ответа (диапазон) ---
  const [responseDelayMin, setResponseDelayMin] = useState(2)
  const [responseDelayMax, setResponseDelayMax] = useState(8)

  // --- Индикатор «печатает…» ---
  const [typingEnabled, setTypingEnabled] = useState(true)
  const [typingDurationSeconds, setTypingDurationSeconds] = useState(3)

  // --- Слот занят ---
  const [slotTakenMessage, setSlotTakenMessage] = useState(
    "К сожалению, это время только что заняли. Давайте подберём другое — какое вам удобно?"
  )

  // --- Уведомления ---
  const [notifChannelTelegram, setNotifChannelTelegram] = useState(true)
  const [notifChannelEmail, setNotifChannelEmail] = useState(false)
  const [notifRecipientMaster, setNotifRecipientMaster] = useState(false)
  const [notifRecipientOwner, setNotifRecipientOwner] = useState(true)
  const [notifRecipientAdmin, setNotifRecipientAdmin] = useState(false)
  const [notifTelegramChatId, setNotifTelegramChatId] = useState("")
  const [notifEmail, setNotifEmail] = useState("")

  // --- Метрика успеха ---
  const [successMetric, setSuccessMetric] = useState<"booked" | "showed" | "paid">("booked")

  // --- Пресеты ---
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(false)
  const [presetsSaving, setPresetsSaving] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")

  // --- Состояние песочницы ---
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Хелпер: собрать текущий объект settings из всех полей формы
  // ---------------------------------------------------------------------------
  const buildSettings = useCallback((): SalesChatbotSettings => {
    const channels: Array<"telegram" | "email"> = []
    if (notifChannelTelegram) channels.push("telegram")
    if (notifChannelEmail) channels.push("email")

    const recipients: Array<"master" | "owner" | "admin"> = []
    if (notifRecipientMaster) recipients.push("master")
    if (notifRecipientOwner) recipients.push("owner")
    if (notifRecipientAdmin) recipients.push("admin")

    return {
      timePicking: { mode: timePickingMode },
      booking: { autoConfirm },
      followUp: { enabled: followUpEnabled, firstTouchMinutes, secondTouchHours, maxTouches },
      escalation: { onExplicitRequest: escalationOnRequest },
      responseTiming: { delaySeconds, enableShortMessages, shortToMainDelaySeconds },
      nightMode: {
        enabled: nightModeEnabled,
        startHour: nightModeStartHour,
        endHour: nightModeEndHour,
        mode: nightModeMode,
        ackMessage: nightModeAckMessage,
      },
      responseDelay: {
        minSeconds: responseDelayMin,
        maxSeconds: responseDelayMax,
      },
      typing: {
        enabled: typingEnabled,
        durationSeconds: typingDurationSeconds,
      },
      slotTaken: {
        message: slotTakenMessage,
      },
      notifications: {
        channels,
        recipients,
        telegramChatId: notifTelegramChatId || null,
        email: notifEmail || null,
      },
      successMetric,
    }
  }, [
    timePickingMode, autoConfirm,
    followUpEnabled, firstTouchMinutes, secondTouchHours, maxTouches,
    escalationOnRequest, delaySeconds, enableShortMessages, shortToMainDelaySeconds,
    nightModeEnabled, nightModeStartHour, nightModeEndHour, nightModeMode, nightModeAckMessage,
    responseDelayMin, responseDelayMax,
    typingEnabled, typingDurationSeconds,
    slotTakenMessage,
    notifChannelTelegram, notifChannelEmail,
    notifRecipientMaster, notifRecipientOwner, notifRecipientAdmin,
    notifTelegramChatId, notifEmail,
    successMetric,
  ])

  // ---------------------------------------------------------------------------
  // Хелпер: применить объект settings к полям формы
  // ---------------------------------------------------------------------------
  const applySettings = useCallback((s: SalesChatbotSettings) => {
    if (!s) return
    setTimePickingMode(s.timePicking?.mode ?? "hybrid")
    setAutoConfirm(s.booking?.autoConfirm ?? false)
    setFollowUpEnabled(s.followUp?.enabled ?? true)
    setFirstTouchMinutes(s.followUp?.firstTouchMinutes ?? 90)
    setSecondTouchHours(s.followUp?.secondTouchHours ?? 24)
    setMaxTouches(s.followUp?.maxTouches ?? 3)
    setEscalationOnRequest(s.escalation?.onExplicitRequest ?? true)
    setDelaySeconds(s.responseTiming?.delaySeconds ?? 10)
    setEnableShortMessages(s.responseTiming?.enableShortMessages ?? false)
    setShortToMainDelaySeconds(s.responseTiming?.shortToMainDelaySeconds ?? 8)

    setNightModeEnabled(s.nightMode?.enabled ?? true)
    setNightModeStartHour(s.nightMode?.startHour ?? 22)
    setNightModeEndHour(s.nightMode?.endHour ?? 9)
    setNightModeMode(s.nightMode?.mode ?? "instant_ack")
    setNightModeAckMessage(
      s.nightMode?.ackMessage ??
      "Здравствуйте! Сейчас нерабочее время, но я уже могу записать вас — подскажите услугу и удобное время."
    )

    setResponseDelayMin(s.responseDelay?.minSeconds ?? 2)
    setResponseDelayMax(s.responseDelay?.maxSeconds ?? 8)

    setTypingEnabled(s.typing?.enabled ?? true)
    setTypingDurationSeconds(s.typing?.durationSeconds ?? 3)

    setSlotTakenMessage(
      s.slotTaken?.message ??
      "К сожалению, это время только что заняли. Давайте подберём другое — какое вам удобно?"
    )

    const ch = s.notifications?.channels ?? ["telegram"]
    setNotifChannelTelegram(ch.includes("telegram"))
    setNotifChannelEmail(ch.includes("email"))

    const rec = s.notifications?.recipients ?? ["owner"]
    setNotifRecipientMaster(rec.includes("master"))
    setNotifRecipientOwner(rec.includes("owner"))
    setNotifRecipientAdmin(rec.includes("admin"))

    setNotifTelegramChatId(s.notifications?.telegramChatId ?? "")
    setNotifEmail(s.notifications?.email ?? "")

    setSuccessMetric(s.successMetric ?? "booked")
  }, [])

  // --- Загрузка конфига ---
  useEffect(() => {
    fetch("/api/modules/sales/chatbot/config")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.data) return
        const cfg: ChatbotConfig = data.data
        setIsEnabled(cfg.isEnabled ?? true)
        setBotName(cfg.botName ?? "")
        setGreeting(cfg.greeting ?? "")
        setSystemPrompt(cfg.systemPrompt ?? "")
        if (cfg.settings) {
          applySettings(cfg.settings)
        }
      })
      .catch(() => toast.error("Не удалось загрузить настройки"))
      .finally(() => setLoading(false))
  }, [applySettings])

  // --- Загрузка пресетов ---
  useEffect(() => {
    setPresetsLoading(true)
    fetch("/api/modules/sales/chatbot/presets")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.data)) {
          setPresets(data.data)
        } else if (Array.isArray(data)) {
          setPresets(data)
        }
      })
      .catch(() => {/* пресеты опциональны — молчим */})
      .finally(() => setPresetsLoading(false))
  }, [])

  // --- Прокрутка чата вниз ---
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // --- Сохранение ---
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const settings = buildSettings()
      const res = await fetch("/api/modules/sales/chatbot/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled, botName, greeting, systemPrompt, settings }),
      })
      if (!res.ok) throw new Error("Сервер вернул ошибку")
      toast.success("Настройки сохранены")
    } catch {
      toast.error("Не удалось сохранить настройки")
    } finally {
      setSaving(false)
    }
  }, [isEnabled, botName, greeting, systemPrompt, buildSettings])

  // --- Применить пресет ---
  const handleApplyPreset = useCallback((preset: Preset) => {
    applySettings(preset.settings)
    toast.success(`Пресет «${preset.name}» применён — нажмите «Сохранить» для фиксации`)
  }, [applySettings])

  // --- Пресет по умолчанию ---
  const handleSetDefaultPreset = useCallback(async (preset: Preset) => {
    try {
      const res = await fetch("/api/modules/sales/chatbot/presets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: preset.id, isDefault: true }),
      })
      if (!res.ok) throw new Error()
      setPresets((prev) =>
        prev.map((p) => ({ ...p, isDefault: p.id === preset.id }))
      )
      toast.success(`Пресет «${preset.name}» — теперь по умолчанию`)
    } catch {
      toast.error("Не удалось обновить пресет")
    }
  }, [])

  // --- Удалить пресет ---
  const handleDeletePreset = useCallback(async (preset: Preset) => {
    try {
      const res = await fetch("/api/modules/sales/chatbot/presets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: preset.id }),
      })
      if (!res.ok) throw new Error()
      setPresets((prev) => prev.filter((p) => p.id !== preset.id))
      toast.success(`Пресет «${preset.name}» удалён`)
    } catch {
      toast.error("Не удалось удалить пресет")
    }
  }, [])

  // --- Сохранить текущие настройки как пресет ---
  const handleSavePreset = useCallback(async () => {
    const name = newPresetName.trim()
    if (!name) {
      toast.error("Введите название пресета")
      return
    }
    setPresetsSaving(true)
    try {
      const settings = buildSettings()
      const res = await fetch("/api/modules/sales/chatbot/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, settings }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const created: Preset = data?.data ?? data
      if (created?.id) {
        setPresets((prev) => [...prev, created])
      } else {
        // Перезагрузить список если сервер не вернул объект
        const listRes = await fetch("/api/modules/sales/chatbot/presets")
        const listData = await listRes.json()
        if (Array.isArray(listData?.data)) setPresets(listData.data)
        else if (Array.isArray(listData)) setPresets(listData)
      }
      setNewPresetName("")
      toast.success(`Пресет «${name}» сохранён`)
    } catch {
      toast.error("Не удалось сохранить пресет")
    } finally {
      setPresetsSaving(false)
    }
  }, [newPresetName, buildSettings])

  // --- Отправка сообщения в песочнице ---
  const handleSandboxSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || sandboxLoading) return

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text }
    const loadingMsg: ChatMessage = { id: uid(), role: "assistant", content: "", isLoading: true }

    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setInputText("")
    setSandboxLoading(true)

    try {
      const history = messages
        .filter((m) => !m.isLoading)
        .map((m) => ({ role: m.role, content: m.content }))

      const settings = buildSettings()

      const res = await fetch("/api/modules/sales/chatbot/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          config: { botName, greeting, systemPrompt, settings },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error ?? "Ошибка сервера")
      }

      const d = data?.data ?? data
      const reply = d?.reply ?? d?.preMessage ?? "(нет ответа)"

      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                ...m,
                content: reply,
                isLoading: false,
                action: d?.action,
                category: d?.category,
                confidence: d?.confidence ?? undefined,
                escalationReason: d?.escalationReason ?? undefined,
              }
            : m
        )
      )
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? { ...m, content: err instanceof Error ? err.message : "Ошибка", isLoading: false, action: "error" }
            : m
        )
      )
    } finally {
      setSandboxLoading(false)
    }
  }, [
    inputText, sandboxLoading, messages,
    botName, greeting, systemPrompt, buildSettings,
  ])

  // ---------------------------------------------------------------------------
  // Рендер
  // ---------------------------------------------------------------------------

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Шапка */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">AI Чат-бот</h1>
                  <p className="text-sm text-muted-foreground">
                    Настройки и тестирование бота для клиентских диалогов
                  </p>
                </div>
              </div>
            </div>

            {/* Вкладки */}
            <Tabs defaultValue="settings">
              <TabsList className="mb-6">
                <TabsTrigger value="settings" className="gap-2">
                  <Settings2 className="w-4 h-4" />
                  Настройки
                </TabsTrigger>
                <TabsTrigger value="sandbox" className="gap-2">
                  <FlaskConical className="w-4 h-4" />
                  Песочница
                </TabsTrigger>
              </TabsList>

              {/* ================================================================
                  ВКЛАДКА: Настройки
              ================================================================ */}
              <TabsContent value="settings">
                {loading ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Загрузка…
                  </div>
                ) : (
                  <div className="space-y-5 max-w-2xl">

                    {/* ============================================================
                        ПРЕСЕТЫ НАСТРОЕК
                    ============================================================ */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Star className="w-4 h-4 text-primary" />
                          Пресеты настроек
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {presetsLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Загрузка пресетов…
                          </div>
                        ) : presets.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Нет сохранённых пресетов. Настройте параметры ниже и сохраните как пресет.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {presets.map((preset) => (
                              <div
                                key={preset.id}
                                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5 bg-muted/20"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-medium truncate">{preset.name}</span>
                                  {preset.isDefault && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                                      по умолчанию
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0 ml-3">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => handleApplyPreset(preset)}
                                  >
                                    <Check className="w-3 h-3" />
                                    Применить
                                  </Button>
                                  {!preset.isDefault && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleSetDefaultPreset(preset)}
                                    >
                                      <Star className="w-3 h-3" />
                                      По умолч.
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeletePreset(preset)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <Separator />

                        {/* Сохранить текущие настройки как новый пресет */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Сохранить текущие настройки как пресет</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Название пресета, например: Ночной режим, Выходные"
                              value={newPresetName}
                              onChange={(e) => setNewPresetName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSavePreset()
                              }}
                              className="flex-1"
                            />
                            <Button
                              variant="outline"
                              onClick={handleSavePreset}
                              disabled={presetsSaving || !newPresetName.trim()}
                              className="gap-2 shrink-0"
                            >
                              {presetsSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <BookmarkPlus className="w-4 h-4" />
                              )}
                              Сохранить
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Сохраняет все текущие настройки формы (ниже) без обращения к серверу конфига
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Основные параметры */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Основные параметры</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Switch: бот включён */}
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Бот включён</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              При выключении — бот не отвечает клиентам
                            </p>
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={setIsEnabled}
                          />
                        </div>

                        <Separator />

                        {/* Имя бота */}
                        <div className="space-y-1.5">
                          <Label htmlFor="botName" className="text-sm">
                            Имя бота
                          </Label>
                          <Input
                            id="botName"
                            placeholder="Например: Алиса, Ассистент"
                            value={botName}
                            onChange={(e) => setBotName(e.target.value)}
                          />
                        </div>

                        {/* Приветствие */}
                        <div className="space-y-1.5">
                          <Label htmlFor="greeting" className="text-sm">
                            Приветствие
                          </Label>
                          <Textarea
                            id="greeting"
                            placeholder="Первое сообщение клиенту при начале диалога"
                            value={greeting}
                            onChange={(e) => setGreeting(e.target.value)}
                            rows={3}
                          />
                        </div>

                        {/* Инструкции */}
                        <div className="space-y-1.5">
                          <Label htmlFor="systemPrompt" className="text-sm">
                            Инструкции для бота
                          </Label>
                          <Textarea
                            id="systemPrompt"
                            placeholder="Контекст салона, услуги, особенности — всё, что поможет боту отвечать точнее"
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            rows={5}
                            className="font-mono text-xs leading-relaxed"
                          />
                          <p className="text-xs text-muted-foreground">
                            Опишите чем занимается салон, какие услуги предлагает, как обращаться к клиентам
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Поведение */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Поведение</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5">

                        {/* Подбор времени */}
                        <div className="space-y-1.5">
                          <Label className="text-sm">Режим подбора времени</Label>
                          <Select
                            value={timePickingMode}
                            onValueChange={(v) => setTimePickingMode(v as TimePickingMode)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hybrid">
                                Гибрид — сначала уточнить предпочтение, затем предложить слоты
                              </SelectItem>
                              <SelectItem value="nearest">
                                Ближайшие — сразу предложить первые свободные слоты
                              </SelectItem>
                              <SelectItem value="ask">
                                По запросу — уточнять пожелания перед любым предложением
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Separator />

                        {/* Автоподтверждение */}
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Автоподтверждение брони</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Если выключено — финальное подтверждение за администратором
                            </p>
                          </div>
                          <Switch
                            checked={autoConfirm}
                            onCheckedChange={setAutoConfirm}
                          />
                        </div>

                        <Separator />

                        {/* Дожим */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm font-medium">Дожим</Label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Автоматические напоминания клиентам, не завершившим запись
                              </p>
                            </div>
                            <Switch
                              checked={followUpEnabled}
                              onCheckedChange={setFollowUpEnabled}
                            />
                          </div>

                          {followUpEnabled && (
                            <div className="grid grid-cols-3 gap-3 pl-0 pt-1">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  1-е касание (мин)
                                </Label>
                                <Input
                                  type="number"
                                  min={5}
                                  max={1440}
                                  value={firstTouchMinutes}
                                  onChange={(e) => setFirstTouchMinutes(Number(e.target.value))}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  2-е касание (ч)
                                </Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={72}
                                  value={secondTouchHours}
                                  onChange={(e) => setSecondTouchHours(Number(e.target.value))}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  Макс. касаний
                                </Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={maxTouches}
                                  onChange={(e) => setMaxTouches(Number(e.target.value))}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* Эскалация */}
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Эскалация по просьбе</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Передавать диалог оператору при явной просьбе клиента
                            </p>
                          </div>
                          <Switch
                            checked={escalationOnRequest}
                            onCheckedChange={setEscalationOnRequest}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Тайминги ответа */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Тайминги ответа</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">

                        {/* delaySeconds */}
                        <div className="space-y-1.5">
                          <Label className="text-sm">
                            Задержка перед ответом (сек)
                          </Label>
                          <div className="flex items-center gap-3">
                            <Input
                              type="number"
                              min={1}
                              max={300}
                              value={delaySeconds}
                              onChange={(e) => setDelaySeconds(Number(e.target.value))}
                              className="w-28"
                            />
                            <span className="text-xs text-muted-foreground">
                              Имитирует живое общение, 1–300 сек
                            </span>
                          </div>
                        </div>

                        <Separator />

                        {/* Короткие сообщения */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm font-medium">
                                Короткие сообщения «минутку»
                              </Label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Отправлять короткую фразу-заглушку перед основным ответом
                              </p>
                            </div>
                            <Switch
                              checked={enableShortMessages}
                              onCheckedChange={setEnableShortMessages}
                            />
                          </div>

                          {enableShortMessages && (
                            <div className="space-y-1 pl-0 pt-1">
                              <Label className="text-xs text-muted-foreground">
                                Пауза после короткого (сек)
                              </Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="number"
                                  min={3}
                                  max={60}
                                  value={shortToMainDelaySeconds}
                                  onChange={(e) =>
                                    setShortToMainDelaySeconds(Number(e.target.value))
                                  }
                                  className="w-28"
                                />
                                <span className="text-xs text-muted-foreground">3–60 сек</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* responseDelay: диапазон */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Задержка ответа (диапазон, сек)</Label>
                          <p className="text-xs text-muted-foreground">
                            Бот выбирает случайное значение из диапазона — выглядит живее фиксированной задержки
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">От</Label>
                              <Input
                                type="number"
                                min={1}
                                max={300}
                                value={responseDelayMin}
                                onChange={(e) => setResponseDelayMin(Number(e.target.value))}
                                className="w-24 h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">До</Label>
                              <Input
                                type="number"
                                min={1}
                                max={300}
                                value={responseDelayMax}
                                onChange={(e) => setResponseDelayMax(Number(e.target.value))}
                                className="w-24 h-8 text-sm"
                              />
                            </div>
                            <span className="text-xs text-muted-foreground self-end pb-1.5">сек</span>
                          </div>
                        </div>

                        <Separator />

                        {/* typing */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm font-medium">Показывать «печатает…»</Label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Индикатор набора текста перед отправкой ответа
                              </p>
                            </div>
                            <Switch
                              checked={typingEnabled}
                              onCheckedChange={setTypingEnabled}
                            />
                          </div>

                          {typingEnabled && (
                            <div className="space-y-1 pt-1">
                              <Label className="text-xs text-muted-foreground">
                                Длительность индикатора (сек)
                              </Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={typingDurationSeconds}
                                  onChange={(e) => setTypingDurationSeconds(Number(e.target.value))}
                                  className="w-24 h-8 text-sm"
                                />
                                <span className="text-xs text-muted-foreground">1–30 сек</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Ночной режим */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Ночной режим</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Включён</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              В указанные часы бот переходит в особый режим работы
                            </p>
                          </div>
                          <Switch
                            checked={nightModeEnabled}
                            onCheckedChange={setNightModeEnabled}
                          />
                        </div>

                        {nightModeEnabled && (
                          <>
                            <Separator />

                            {/* Часы */}
                            <div className="space-y-1.5">
                              <Label className="text-sm">Диапазон часов</Label>
                              <div className="flex items-center gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">С (час, 0–23)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={nightModeStartHour}
                                    onChange={(e) => setNightModeStartHour(Number(e.target.value))}
                                    className="w-20 h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">До (час, 0–23)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={nightModeEndHour}
                                    onChange={(e) => setNightModeEndHour(Number(e.target.value))}
                                    className="w-20 h-8 text-sm"
                                  />
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Например: с 22 до 9 — ночь с 22:00 до 09:00
                              </p>
                            </div>

                            <Separator />

                            {/* Режим */}
                            <div className="space-y-1.5">
                              <Label className="text-sm">Режим</Label>
                              <Select
                                value={nightModeMode}
                                onValueChange={(v) => setNightModeMode(v as "instant_ack" | "full_reply")}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="instant_ack">
                                    Мгновенное авто-сообщение — шлёт ackMessage, не ждёт AI
                                  </SelectItem>
                                  <SelectItem value="full_reply">
                                    Полный ответ — AI отвечает как обычно (бот «дежурит»)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {nightModeMode === "instant_ack" && (
                              <div className="space-y-1.5">
                                <Label className="text-sm">Текст авто-ответа</Label>
                                <Textarea
                                  placeholder="Текст, который бот пришлёт клиенту в нерабочее время"
                                  value={nightModeAckMessage}
                                  onChange={(e) => setNightModeAckMessage(e.target.value)}
                                  rows={3}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* Слот занят */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Слот занят</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Сообщение клиенту, если слот занят</Label>
                          <Textarea
                            placeholder="Текст, если выбранное время успели занять до подтверждения"
                            value={slotTakenMessage}
                            onChange={(e) => setSlotTakenMessage(e.target.value)}
                            rows={3}
                          />
                          <p className="text-xs text-muted-foreground">
                            Отправляется автоматически, когда выбранный слот был занят другим клиентом
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Уведомления */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Уведомления</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5">

                        {/* Каналы */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Каналы уведомлений</Label>
                          <div className="flex items-center gap-5">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="notifTelegram"
                                checked={notifChannelTelegram}
                                onCheckedChange={(v) => setNotifChannelTelegram(Boolean(v))}
                              />
                              <Label htmlFor="notifTelegram" className="text-sm font-normal cursor-pointer">
                                Telegram
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="notifEmail"
                                checked={notifChannelEmail}
                                onCheckedChange={(v) => setNotifChannelEmail(Boolean(v))}
                              />
                              <Label htmlFor="notifEmail" className="text-sm font-normal cursor-pointer">
                                Email
                              </Label>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Получатели */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Получатели</Label>
                          <div className="flex items-center gap-5">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="recMaster"
                                checked={notifRecipientMaster}
                                onCheckedChange={(v) => setNotifRecipientMaster(Boolean(v))}
                              />
                              <Label htmlFor="recMaster" className="text-sm font-normal cursor-pointer">
                                Мастер
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="recOwner"
                                checked={notifRecipientOwner}
                                onCheckedChange={(v) => setNotifRecipientOwner(Boolean(v))}
                              />
                              <Label htmlFor="recOwner" className="text-sm font-normal cursor-pointer">
                                Владелец
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="recAdmin"
                                checked={notifRecipientAdmin}
                                onCheckedChange={(v) => setNotifRecipientAdmin(Boolean(v))}
                              />
                              <Label htmlFor="recAdmin" className="text-sm font-normal cursor-pointer">
                                Админ
                              </Label>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Контакты */}
                        {notifChannelTelegram && (
                          <div className="space-y-1.5">
                            <Label htmlFor="telegramChatId" className="text-sm">
                              Telegram Chat ID
                            </Label>
                            <Input
                              id="telegramChatId"
                              placeholder="-100xxxxxxxxx или @username"
                              value={notifTelegramChatId}
                              onChange={(e) => setNotifTelegramChatId(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Числовой ID чата или @username канала/группы
                            </p>
                          </div>
                        )}

                        {notifChannelEmail && (
                          <div className="space-y-1.5">
                            <Label htmlFor="notifEmailAddr" className="text-sm">
                              Email для уведомлений
                            </Label>
                            <Input
                              id="notifEmailAddr"
                              type="email"
                              placeholder="admin@salon.ru"
                              value={notifEmail}
                              onChange={(e) => setNotifEmail(e.target.value)}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Метрика успеха */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Метрика успеха</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Когда считать диалог успешным</Label>
                          <Select
                            value={successMetric}
                            onValueChange={(v) => setSuccessMetric(v as "booked" | "showed" | "paid")}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="booked">Записался — клиент оставил заявку</SelectItem>
                              <SelectItem value="showed">Дошёл — клиент пришёл на визит</SelectItem>
                              <SelectItem value="paid">Оплатил — клиент совершил оплату</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Влияет на аналитику конверсии диалогов
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Кнопка сохранить */}
                    <div className="flex justify-end pt-1">
                      <Button onClick={handleSave} disabled={saving} className="gap-2">
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {saving ? "Сохранение…" : "Сохранить"}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ================================================================
                  ВКЛАДКА: Песочница
              ================================================================ */}
              <TabsContent value="sandbox">
                <div className="max-w-2xl">
                  <Card className="flex flex-col" style={{ height: "calc(100vh - 260px)", minHeight: 500 }}>
                    <CardHeader className="pb-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Тестовый диалог</CardTitle>
                        <Badge variant="secondary" className="text-xs">dryRun — не пишет в БД</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Бот использует текущие настройки формы (не сохранённые). Сохраните настройки для получения реального поведения.
                      </p>
                    </CardHeader>

                    {/* Область сообщений */}
                    <CardContent className="flex-1 overflow-y-auto px-4 pb-0 space-y-3">
                      {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <Bot className="w-6 h-6 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-foreground">Отправьте первое сообщение</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Напишите как клиент, чтобы проверить ответы бота
                          </p>
                        </div>
                      )}

                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.role === "user" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted text-foreground rounded-bl-sm"
                            )}
                          >
                            {msg.isLoading ? (
                              <div className="flex items-center gap-1.5 py-0.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Генерирует ответ…</span>
                              </div>
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                {msg.role === "assistant" && (
                                  <ResponseBadges
                                    action={msg.action}
                                    category={msg.category}
                                    confidence={msg.confidence}
                                    escalationReason={msg.escalationReason}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={bottomRef} />
                    </CardContent>

                    {/* Поле ввода */}
                    <div className="shrink-0 px-4 py-3 border-t border-border/60">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Напишите как клиент…"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleSandboxSend()
                            }
                          }}
                          disabled={sandboxLoading}
                          className="flex-1"
                        />
                        <Button
                          onClick={handleSandboxSend}
                          disabled={!inputText.trim() || sandboxLoading}
                          size="icon"
                          className="shrink-0"
                        >
                          {sandboxLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Enter — отправить · Shift+Enter — новая строка
                      </p>
                    </div>
                  </Card>

                  {/* Кнопка очистить чат */}
                  {messages.length > 0 && (
                    <div className="flex justify-end mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground text-xs"
                        onClick={() => setMessages([])}
                      >
                        Очистить диалог
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
