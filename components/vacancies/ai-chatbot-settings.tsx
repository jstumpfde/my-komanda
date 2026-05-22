"use client"

// #62: AI чат-бот для общения с кандидатами. Раньше всё было disabled —
// теперь админ может включить и редактировать настройки. Бэк (scan-incoming
// / process-queue) пока НЕ подключён к этим настройкам, поэтому оставлен
// бейдж «В разработке» — это предупреждение, что обработка не работает.
//
// Взаимоисключение с legacy-сообщениями: когда aiChatbotEnabled=true для
// вакансии, родитель скрывает блоки «Серия первых сообщений», «Цепочка
// дожима» и «Аварийное повторное» (см. page.tsx, секция «Сообщения»).

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Bot, Wand2, Eye, Shield, Send, Loader2, Save, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const TRIGGERS = [
  { id: "salary",        label: "Вопросы о зарплате",                        defaultOn: true  },
  { id: "schedule",      label: "Вопросы о графике работы",                  defaultOn: true  },
  { id: "location",      label: "Вопросы о локации (офис / гибрид / удалёнка)", defaultOn: true  },
  { id: "experience",    label: "Вопросы о требованиях к опыту",             defaultOn: true  },
  { id: "callRedirect",  label: "Просьбы о звонке (перенаправление на демо)", defaultOn: true  },
  { id: "demoCheckin",   label: "Вопросы «удалось посмотреть демо?»",        defaultOn: true  },
  { id: "interviewSlot", label: "Согласование времени интервью (осторожно)", defaultOn: false },
]

interface ChatbotSettings {
  triggers?:           Record<string, boolean>
  confidenceThreshold?: number   // 0..100
  dailyLimitPerCandidate?: number
  stopWordsBreak?:     boolean
  telegramChannel?:    string
}

interface AiChatbotSettingsProps {
  vacancyId: string
  /** Вызывается после успешного сохранения — родитель может рефетчить вакансию. */
  onSaved?: () => void
}

export function AiChatbotSettings({ vacancyId, onSaved }: AiChatbotSettingsProps) {
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [settings, setSettings] = useState<ChatbotSettings>({})

  // Local state for UI controls, дефолты подтягиваем из TRIGGERS.
  const [triggers, setTriggers] = useState<Record<string, boolean>>(
    Object.fromEntries(TRIGGERS.map(t => [t.id, t.defaultOn])),
  )
  const [confidence, setConfidence] = useState(70)
  const [dailyLimit, setDailyLimit] = useState(5)
  const [stopWordsBreak, setStopWordsBreak] = useState(true)
  const [telegramChannel, setTelegramChannel] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { enabled?: boolean; settings?: ChatbotSettings } | null) => {
        if (cancelled || !d) return
        setEnabled(Boolean(d.enabled))
        const s = d.settings ?? {}
        setSettings(s)
        if (s.triggers && typeof s.triggers === "object") {
          setTriggers(prev => ({ ...prev, ...s.triggers }))
        }
        if (typeof s.confidenceThreshold === "number") setConfidence(s.confidenceThreshold)
        if (typeof s.dailyLimitPerCandidate === "number") setDailyLimit(s.dailyLimitPerCandidate)
        if (typeof s.stopWordsBreak === "boolean") setStopWordsBreak(s.stopWordsBreak)
        if (typeof s.telegramChannel === "string") setTelegramChannel(s.telegramChannel)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async (overrides?: { enabled?: boolean }) => {
    setSaving(true)
    try {
      const payload = {
        enabled: overrides?.enabled ?? enabled,
        settings: {
          triggers,
          confidenceThreshold: confidence,
          dailyLimitPerCandidate: dailyLimit,
          stopWordsBreak,
          telegramChannel,
        },
      }
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error("Не удалось сохранить настройки")
        return
      }
      const data = await res.json().catch(() => null) as { enabled?: boolean; settings?: ChatbotSettings } | null
      if (data) {
        setEnabled(Boolean(data.enabled))
        if (data.settings) setSettings(data.settings)
      }
      toast.success("AI-агент сохранён")
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEnabled = (next: boolean) => {
    setEnabled(next)
    // Сохраняем сразу — главный тумблер должен реагировать мгновенно.
    void save({ enabled: next })
  }

  return (
    <div className={cn("space-y-6 max-w-3xl", !loaded && "opacity-60")}>
      {/* Header card — главный тумблер */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI чат-бот для общения с кандидатами
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1 bg-amber-50 text-amber-800 border-amber-200">
                  В разработке
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Можно включить и сохранить настройки, но обработка входящих
                сообщений AI-агентом пока не выполняется — это будет на
                следующей неделе. Сейчас включение НЕ отменяет работу обычной
                цепочки сообщений.
              </CardDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={saving} />
          </div>
        </CardHeader>
        {enabled && (
          <CardContent>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200">
                AI-агент включён. Когда обработка заработает (Фазы 4-6), для этой
                вакансии будут отключены: «Серия первых сообщений», «Цепочка
                дожима», «Аварийное повторное сообщение». Сейчас они продолжают
                работать как обычно.
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Когда AI отвечает */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Когда AI отвечает кандидату</CardTitle>
          <CardDescription>Триггеры, на которые бот реагирует автоматически.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {TRIGGERS.map(t => (
            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={triggers[t.id] ?? t.defaultOn}
                onChange={(e) => setTriggers(prev => ({ ...prev, [t.id]: e.target.checked }))}
                className="rounded"
              />
              {t.label}
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Промпт */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Промпт для агента</CardTitle>
          <CardDescription>
            Промпт автоматически генерируется на основе:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>Профиля компании (из настроек компании)</li>
            <li>Анкеты вакансии (зарплата, требования, формат)</li>
            <li>Шаблонов ответов на типовые вопросы</li>
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 text-xs">
              <Wand2 className="w-3.5 h-3.5" /> Сгенерировать промпт
            </Button>
            <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 text-xs">
              <Eye className="w-3.5 h-3.5" /> Просмотр промпта
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Генерация промпта появится с обработкой в Фазах 4-6.
          </p>
        </CardContent>
      </Card>

      {/* Безопасность */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" /> Безопасность
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Порог уверенности AI</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{(confidence / 100).toFixed(2)}</span>
            </div>
            <Slider value={[confidence]} onValueChange={([v]) => setConfidence(v)} min={0} max={100} step={5} />
            <p className="text-[11px] text-muted-foreground">
              Если AI не уверен ниже порога — пишет в Telegram HR.
            </p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Лимит сообщений в день на одного кандидата</Label>
            <Input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
              className="h-8 text-sm bg-[var(--input-bg)] w-32"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Стоп-слова перебивают AI</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Если в ответе кандидата встречается стоп-слово — AI не отвечает, эскалация HR'у.
              </p>
            </div>
            <Switch checked={stopWordsBreak} onCheckedChange={setStopWordsBreak} />
          </div>
        </CardContent>
      </Card>

      {/* Telegram канал */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Send className="w-4 h-4" /> Telegram-канал HR для AI-эскалаций
          </CardTitle>
          <CardDescription>Куда AI пишет, если не уверен в ответе или нужно вмешательство.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Канал</Label>
            <Input
              value={telegramChannel}
              onChange={(e) => setTelegramChannel(e.target.value.slice(0, 200))}
              placeholder="@company_hr_alerts"
              className="h-8 text-sm bg-[var(--input-bg)]"
            />
          </div>
          <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 text-xs">
            Подключить Telegram (Скоро)
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => save()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить настройки
        </Button>
      </div>

      {/* settings spread на случай если в БД есть неучтённые ключи (forward-compat) */}
      {Object.keys(settings).length > 0 && null}
    </div>
  )
}
