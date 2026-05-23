"use client"

// #15 AI чат-бот для кандидатов — фазы 2-6 объединены.
// - Фаза 2: реальные state'ы + сохранение в БД.
// - Фаза 3: кнопка «Сгенерировать промпт» вызывает /generate-prompt.
// - Фаза 5: модал подключения Telegram + кнопка «Проверить».
// - Фаза 6: блок метрик внизу (GET /metrics).

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Bot, Wand2, Eye, Shield, Send, Loader2, Save, Pencil, Info, Undo2, FlaskConical } from "lucide-react"
import { AiChatbotSandbox } from "./ai-chatbot-sandbox"
import { toast } from "sonner"

interface Triggers {
  salary: boolean; schedule: boolean; location: boolean; requirements: boolean
  callRequest: boolean; demoCheckIn: boolean; interviewScheduling: boolean
}
const DEFAULT_TRIGGERS: Triggers = {
  salary: true, schedule: true, location: true, requirements: true,
  callRequest: true, demoCheckIn: true, interviewScheduling: false,
}
const TRIGGER_LIST: { key: keyof Triggers; label: string }[] = [
  { key: "salary",              label: "Вопросы о зарплате" },
  { key: "schedule",            label: "Вопросы о графике работы" },
  { key: "location",            label: "Вопросы о локации (офис / гибрид / удалёнка)" },
  { key: "requirements",        label: "Вопросы о требованиях к опыту" },
  { key: "callRequest",         label: "Просьбы о звонке (перенаправление на демо)" },
  { key: "demoCheckIn",         label: "Вопросы «удалось посмотреть демо?»" },
  { key: "interviewScheduling", label: "Согласование времени интервью (осторожно)" },
]

// Группа 30: старые типы оставлены для backward-compat с уже сохранёнными
// settings.abuseFilter. Логика 3-уровневой грубости теперь зашита в
// chatbot-processor.ts и не настраивается через UI (sensitivity/action
// больше не показываются).
/** @deprecated Группа 30 — заменено фиксированной 3-уровневой логикой. */
type AbuseSensitivity = "soft" | "moderate" | "strict"
/** @deprecated Группа 30. */
type AbuseAction = "escalate" | "needs_review" | "auto_reject" | "warn_and_continue"
/** @deprecated Группа 30 — сохраняем поле в state чтобы не затирать сохранённый JSON. */
interface AbuseFilter {
  enabled?:     boolean
  sensitivity?: AbuseSensitivity
  action?:      AbuseAction
}

// Группа 30: шаблоны автоматических отказов. Дефолты — синхронизированы с
// DEFAULT_REJECTION_MESSAGES в lib/ai/chatbot-processor.ts.
interface RejectionMessages {
  injection?:     string
  severeAbuse?:   string
  repeatedAbuse?: string
  unstable?:      string
}

const DEFAULT_REJECTION_MESSAGES: Required<RejectionMessages> = {
  injection:     "В связи с нарушением правил общения мы вынуждены прекратить рассмотрение вашей кандидатуры.",
  severeAbuse:   "Мы вынуждены прекратить общение в связи с нарушением норм общения.",
  repeatedAbuse: "К сожалению, мы решили прекратить общение.",
  unstable:      "По итогам нашего общения мы решили пока не двигаться дальше. Спасибо за интерес к нашей компании.",
}

// Группа 33: тайминги ответа. Должны совпадать с DEFAULT_RESPONSE_TIMING
// в lib/ai/chatbot-processor.ts.
interface ResponseTiming {
  delaySeconds:               number
  enableShortMessages:        boolean
  shortMessages:              string[]
  maxShortMessagesPerDialog:  number
  shortToMainDelaySeconds:    number
}

const DEFAULT_SHORT_MESSAGES: string[] = [
  "Минутку, сейчас посмотрю...",
  "Секунду, проверю информацию",
  "Сейчас уточню, минутку...",
  "Один момент...",
  "Подождите немного, отвечу подробно",
  "Сейчас отвечу",
  "Минутку",
]

const DEFAULT_RESPONSE_TIMING: ResponseTiming = {
  delaySeconds:               10,
  enableShortMessages:        false,
  shortMessages:              DEFAULT_SHORT_MESSAGES,
  maxShortMessagesPerDialog:  2,
  shortToMainDelaySeconds:    8,
}

interface Settings {
  triggers: Triggers
  confidenceThreshold: number  // 0..1
  dailyMessageLimit: number
  stopWordsOverride: boolean
  telegramChannel: string
  /** @deprecated Группа 30 — больше не читается на сервере. */
  autoRejectOnAbuse?: boolean
  /** @deprecated Группа 30 — сохраняем для backward-compat. */
  abuseFilter?: AbuseFilter
  rejectionMessages: Required<RejectionMessages>
  responseTiming: ResponseTiming
}

const DEFAULT_SETTINGS: Settings = {
  triggers: DEFAULT_TRIGGERS,
  confidenceThreshold: 0.7,
  dailyMessageLimit: 5,
  stopWordsOverride: true,
  telegramChannel: "",
  rejectionMessages: DEFAULT_REJECTION_MESSAGES,
  responseTiming: DEFAULT_RESPONSE_TIMING,
}

interface AbuseHistoryItem {
  id: string
  createdAt: string
  candidateId: string
  candidateName: string | null
  reason: string
  action: AbuseAction | "escalate"
  incomingMessage: string
  canUndo: boolean
}

interface Metrics { total: number; sent: number; escalated: number; rejected: number }
interface QuotaUsage { today: number; limit: number; pct: number }

export function AiChatbotSettings({ vacancyId }: { vacancyId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptEditOpen, setPromptEditOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState("")
  const [tgModalOpen, setTgModalOpen] = useState(false)
  const [tgTesting, setTgTesting] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [quota, setQuota] = useState<QuotaUsage | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [auditResult, setAuditResult] = useState<{ ranAt: string; issuesCount: number; summary: string } | null>(null)
  const [sandboxOpen, setSandboxOpen] = useState(false)
  const [abuseHistory, setAbuseHistory] = useState<AbuseHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  const triggersAny = Object.values(settings.triggers).some(Boolean)
  const canEnable = prompt.trim().length > 0

  // Load
  useEffect(() => {
    let off = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (off || !d) return
        if (typeof d.enabled === "boolean") setEnabled(d.enabled)
        if (d.settings && typeof d.settings === "object") {
          setSettings(s => ({
            ...s,
            ...d.settings,
            // Группа 30: гарантируем заполненные rejection-сообщения.
            rejectionMessages: {
              ...DEFAULT_REJECTION_MESSAGES,
              ...(d.settings.rejectionMessages ?? {}),
            },
            // Группа 33: гарантируем заполненные тайминги.
            responseTiming: {
              ...DEFAULT_RESPONSE_TIMING,
              ...(d.settings.responseTiming ?? {}),
              shortMessages: Array.isArray(d.settings.responseTiming?.shortMessages) && d.settings.responseTiming.shortMessages.length > 0
                ? d.settings.responseTiming.shortMessages
                : DEFAULT_SHORT_MESSAGES,
            },
          }))
        }
        if (typeof d.prompt === "string") setPrompt(d.prompt)
      })
      .finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [vacancyId])

  // Metrics
  useEffect(() => {
    fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.metrics) setMetrics(d.metrics)
        if (d?.quotaUsage) setQuota(d.quotaUsage)
      })
      .catch(() => {})
  }, [vacancyId])

  // История срабатываний фильтра оскорблений (#79)
  const loadAbuseHistory = useCallback(() => {
    setHistoryLoading(true)
    fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/abuse-history`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d?.items)) setAbuseHistory(d.items as AbuseHistoryItem[])
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [vacancyId])

  useEffect(() => { loadAbuseHistory() }, [loadAbuseHistory])

  const undoAbuseAction = async (messageId: string) => {
    setUndoingId(messageId)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/undo-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messageId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "undo_failed")
      toast.success("Решение отменено, кандидат восстановлен")
      loadAbuseHistory()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отменить")
    } finally {
      setUndoingId(null)
    }
  }

  const save = useCallback(async (overrides?: Partial<{ enabled: boolean; settings: Settings; prompt: string }>) => {
    setSaving(true)
    try {
      const body = {
        enabled:  overrides?.enabled  ?? enabled,
        settings: overrides?.settings ?? settings,
        prompt:   overrides?.prompt   ?? prompt,
      }
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error("save failed")
      toast.success("Сохранено")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }, [vacancyId, enabled, settings, prompt])

  const generatePrompt = async () => {
    if (!triggersAny) { toast.error("Выберите хотя бы один тип вопросов"); return }
    setGenerating(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/generate-prompt`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ triggers: settings.triggers }),
      })
      const data = await res.json() as { prompt?: string; error?: string }
      if (!res.ok || !data.prompt) throw new Error(data.error || "generate failed")
      setPrompt(data.prompt)
      toast.success(`Промпт сгенерирован (${data.prompt.length} символов)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка генерации")
    } finally {
      setGenerating(false)
    }
  }

  const runAudit = async () => {
    setAuditing(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/watcher-audit`, { method: "POST" })
      const data = await res.json() as { ok?: boolean; issues?: unknown[]; summary?: string; ranAt?: string; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "audit_failed")
      const issuesCount = Array.isArray(data.issues) ? data.issues.length : 0
      setAuditResult({
        ranAt:        data.ranAt ?? new Date().toISOString(),
        issuesCount,
        summary:      data.summary ?? "",
      })
      toast.success(`Аудит выполнен: найдено ${issuesCount} проблем`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось запустить аудит")
    } finally {
      setAuditing(false)
    }
  }

  const testTelegram = async () => {
    setTgTesting(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/test-telegram`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ channel: settings.telegramChannel }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "telegram_failed")
      toast.success("Тестовое сообщение отправлено")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось подключить Telegram")
    } finally {
      setTgTesting(false)
    }
  }

  if (loading) {
    return <div className="max-w-3xl"><Card><CardContent className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></CardContent></Card></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header — главный тумблер */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI чат-бот для общения с кандидатами
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1 bg-blue-50 text-blue-800 border-blue-200">Beta</Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Бот отвечает на типовые вопросы кандидатов в hh-чате. Если не уверен — эскалирует HR'у в Telegram.
              </CardDescription>
              {!canEnable && (
                <p className="text-[11px] text-amber-700 mt-1">Сначала сгенерируйте промпт ниже.</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Switch
                checked={enabled}
                disabled={!canEnable}
                onCheckedChange={v => { setEnabled(v); void save({ enabled: v }) }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSandboxOpen(true)}
                disabled={!canEnable}
                className="gap-1.5 h-8 text-xs"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Тестировать
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Группа 33: Sandbox диалог */}
      <Dialog open={sandboxOpen} onOpenChange={setSandboxOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">Песочница AI чат-бота</DialogTitle>
          <AiChatbotSandbox
            vacancyId={vacancyId}
            onClose={() => setSandboxOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Триггеры */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Когда AI отвечает кандидату</CardTitle>
          <CardDescription>Триггеры, на которые бот реагирует автоматически.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {TRIGGER_LIST.map(t => (
            <label key={t.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={settings.triggers[t.key]}
                onChange={e => setSettings(s => ({ ...s, triggers: { ...s.triggers, [t.key]: e.target.checked } }))}
                className="rounded"
              />
              {t.label}
            </label>
          ))}
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={() => save()} disabled={saving} className="gap-1.5 h-8 text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Промпт */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Промпт для агента</CardTitle>
          <CardDescription>Автоматически генерируется на основе профиля компании, анкеты вакансии и выбранных триггеров.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompt && <p className="text-[11px] text-muted-foreground">Длина промпта: {prompt.length} символов</p>}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={generatePrompt} disabled={generating || !triggersAny} className="gap-1.5 h-8 text-xs">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {prompt ? "Регенерировать" : "Сгенерировать промпт"}
            </Button>
            <Button size="sm" variant="outline" disabled={!prompt} onClick={() => setPromptOpen(true)} className="gap-1.5 h-8 text-xs">
              <Eye className="w-3.5 h-3.5" /> Просмотр промпта
            </Button>
            <Button size="sm" variant="outline" disabled={!prompt} onClick={() => { setPromptDraft(prompt); setPromptEditOpen(true) }} className="gap-1.5 h-8 text-xs">
              <Pencil className="w-3.5 h-3.5" /> Редактировать промпт
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Безопасность */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4" /> Безопасность</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Порог уверенности AI</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{settings.confidenceThreshold.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.confidenceThreshold * 100]}
              min={0} max={100} step={5}
              onValueChange={v => setSettings(s => ({ ...s, confidenceThreshold: (v[0] ?? 70) / 100 }))}
            />
            <p className="text-[11px] text-muted-foreground">Если AI не уверен ниже порога — пишет в Telegram HR.</p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Лимит сообщений в день на одного кандидата</Label>
            <Input
              type="number"
              value={settings.dailyMessageLimit}
              onChange={e => setSettings(s => ({ ...s, dailyMessageLimit: Math.max(1, parseInt(e.target.value) || 5) }))}
              className="h-8 text-sm bg-[var(--input-bg)] w-32"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Стоп-слова перебивают AI</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Если в ответе кандидата встречается стоп-слово — AI не отвечает, эскалация HR'у.</p>
            </div>
            <Switch checked={settings.stopWordsOverride} onCheckedChange={v => setSettings(s => ({ ...s, stopWordsOverride: v }))} />
          </div>
          {/* Группа 30: автоматическая защита всегда включена. Уровни и
              пороги — фиксированы в lib/ai/chatbot-processor.ts. UI
              показывает только информационный блок + редактируемые шаблоны
              сообщений кандидату. */}
          <Alert className="bg-background">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-[11px] leading-relaxed">
              <span className="font-medium">Автоматическая защита (всегда включена):</span>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>Попытка перепрограммировать AI → автоотказ.</li>
                <li>Мат или прямые оскорбления → автоотказ.</li>
                <li>Раздражённый тон без мата → счётчик; на 2-м срабатывании отказ.</li>
                <li>Признаки эмоциональной нестабильности → мягкий отказ.</li>
                <li>Вопросы вне темы → мягко возвращаем в разговор (без отказа).</li>
              </ul>
            </AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => save()} disabled={saving} className="gap-1.5 h-8 text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* #79 История срабатываний фильтра оскорблений */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" /> История срабатываний фильтра оскорблений
          </CardTitle>
          <CardDescription>
            Последние 20 решений. Для автоотказов и перевода в «требует решения» можно отменить и восстановить кандидата.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {historyLoading ? (
            <p className="text-[12px] text-muted-foreground">Загрузка…</p>
          ) : abuseHistory.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Срабатываний пока не было.</p>
          ) : (
            <ul className="space-y-2">
              {abuseHistory.map(item => (
                <li
                  key={item.id}
                  className="rounded-lg border bg-muted/30 p-3 text-[12px] space-y-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-medium truncate">
                        {item.candidateName ?? "Кандидат"}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("ru-RU")} ·{" "}
                        {item.action === "auto_reject" && "автоотказ"}
                        {item.action === "needs_review" && "требует решения"}
                        {item.action === "warn_and_continue" && "предупреждение"}
                        {item.action === "escalate" && "эскалация"}
                      </div>
                    </div>
                    {item.canUndo && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={undoingId === item.id}
                        onClick={() => void undoAbuseAction(item.id)}
                        className="h-7 gap-1.5 text-[11px] shrink-0"
                      >
                        {undoingId === item.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Undo2 className="w-3 h-3" />}
                        Отменить
                      </Button>
                    )}
                  </div>
                  <div className="text-muted-foreground italic line-clamp-2">
                    «{item.incomingMessage}»
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Группа 30: Шаблоны автоматических отказов */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" /> Шаблоны автоматических отказов
          </CardTitle>
          <CardDescription>
            AI отправит эти сообщения кандидату при срабатывании защиты, после чего кандидат
            автоматически переводится в стадию «Отказано».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">При попытке перепрограммировать AI (injection)</Label>
            <Textarea
              value={settings.rejectionMessages.injection}
              onChange={e => setSettings(s => ({
                ...s,
                rejectionMessages: { ...s.rejectionMessages, injection: e.target.value },
              }))}
              rows={2}
              maxLength={500}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">При мате или серьёзных оскорблениях</Label>
            <Textarea
              value={settings.rejectionMessages.severeAbuse}
              onChange={e => setSettings(s => ({
                ...s,
                rejectionMessages: { ...s.rejectionMessages, severeAbuse: e.target.value },
              }))}
              rows={2}
              maxLength={500}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">При повторных неуважительных сообщениях (2-е срабатывание)</Label>
            <Textarea
              value={settings.rejectionMessages.repeatedAbuse}
              onChange={e => setSettings(s => ({
                ...s,
                rejectionMessages: { ...s.rejectionMessages, repeatedAbuse: e.target.value },
              }))}
              rows={2}
              maxLength={500}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">При признаках эмоциональной нестабильности</Label>
            <Textarea
              value={settings.rejectionMessages.unstable}
              onChange={e => setSettings(s => ({
                ...s,
                rejectionMessages: { ...s.rejectionMessages, unstable: e.target.value },
              }))}
              rows={2}
              maxLength={500}
              className="text-sm"
            />
          </div>
          <Alert className="bg-background">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-[11px] leading-relaxed">
              После отправки этих сообщений кандидат переводится в стадию «Отказано»
              автоматически. Историю срабатываний можно посмотреть выше и при необходимости
              отменить решение.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => save()}
              disabled={saving}
              className="gap-1.5 h-8 text-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Группа 33: Поведение и тайминги */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Loader2 className="w-4 h-4" /> Поведение и тайминги
          </CardTitle>
          <CardDescription>
            Настройка скорости и реалистичности ответов AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Задержка перед ответом (секунды)</Label>
            <Input
              type="number"
              min={1}
              max={300}
              value={settings.responseTiming.delaySeconds}
              onChange={(e) => setSettings(s => ({
                ...s,
                responseTiming: {
                  ...s.responseTiming,
                  delaySeconds: Math.max(1, Math.min(300, Number(e.target.value) || 10)),
                },
              }))}
              className="h-8 text-sm w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Через сколько секунд AI ответит после получения сообщения. 10–30 сек создают
              ощущение живого общения.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Короткое сообщение перед ответом</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  «Минутку, посмотрю...» создаёт ощущение живого общения.
                </p>
              </div>
              <Switch
                checked={settings.responseTiming.enableShortMessages}
                onCheckedChange={(v) => setSettings(s => ({
                  ...s,
                  responseTiming: { ...s.responseTiming, enableShortMessages: v },
                }))}
              />
            </div>

            {settings.responseTiming.enableShortMessages && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Шаблоны коротких сообщений</Label>
                  <p className="text-[11px] text-muted-foreground">
                    AI выбирает случайно из этого списка.
                  </p>
                  {settings.responseTiming.shortMessages.map((msg, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={msg}
                        onChange={(e) => setSettings(s => ({
                          ...s,
                          responseTiming: {
                            ...s.responseTiming,
                            shortMessages: s.responseTiming.shortMessages.map((m, i) =>
                              i === idx ? e.target.value : m,
                            ),
                          },
                        }))}
                        className="h-8 text-sm flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={settings.responseTiming.shortMessages.length <= 1}
                        onClick={() => setSettings(s => ({
                          ...s,
                          responseTiming: {
                            ...s.responseTiming,
                            shortMessages: s.responseTiming.shortMessages.filter((_, i) => i !== idx),
                          },
                        }))}
                      >
                        Удалить
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSettings(s => ({
                      ...s,
                      responseTiming: {
                        ...s.responseTiming,
                        shortMessages: [...s.responseTiming.shortMessages, "Новое короткое сообщение"],
                      },
                    }))}
                  >
                    + Добавить шаблон
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Макс. коротких за диалог</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={settings.responseTiming.maxShortMessagesPerDialog}
                      onChange={(e) => setSettings(s => ({
                        ...s,
                        responseTiming: {
                          ...s.responseTiming,
                          maxShortMessagesPerDialog: Math.max(1, Math.min(10, Number(e.target.value) || 2)),
                        },
                      }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Задержка после короткого (сек)</Label>
                    <Input
                      type="number"
                      min={3}
                      max={60}
                      value={settings.responseTiming.shortToMainDelaySeconds}
                      onChange={(e) => setSettings(s => ({
                        ...s,
                        responseTiming: {
                          ...s.responseTiming,
                          shortToMainDelaySeconds: Math.max(3, Math.min(60, Number(e.target.value) || 8)),
                        },
                      }))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => save()}
              disabled={saving}
              className="gap-1.5 h-8 text-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Send className="w-4 h-4" /> Telegram-канал HR для AI-эскалаций</CardTitle>
          <CardDescription>Куда AI пишет, если не уверен в ответе или нужно вмешательство.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Канал</Label>
            <Input
              value={settings.telegramChannel}
              onChange={e => setSettings(s => ({ ...s, telegramChannel: e.target.value }))}
              placeholder="@company_hr_alerts"
              className="h-8 text-sm bg-[var(--input-bg)]"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setTgModalOpen(true)} className="gap-1.5 h-8 text-xs">
              Инструкция по подключению
            </Button>
            <Button size="sm" onClick={() => { void save(); void testTelegram() }} disabled={tgTesting || !settings.telegramChannel.trim()} className="gap-1.5 h-8 text-xs">
              {tgTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Сохранить и проверить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Метрики */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Метрики за последние 7 дней</CardTitle>
        </CardHeader>
        <CardContent>
          {!metrics ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><p className="text-[11px] text-muted-foreground">Обработано</p><p className="text-xl font-bold">{metrics.total}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Автоответов</p><p className="text-xl font-bold text-emerald-600">{metrics.sent}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Эскалаций к HR</p><p className="text-xl font-bold text-amber-600">{metrics.escalated}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Отказов сгенерировано</p><p className="text-xl font-bold text-red-600">{metrics.rejected}</p></div>
            </div>
          )}
          {quota && (
            <div className="pt-4 mt-4 border-t space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Квота AI-вызовов сегодня (по компании)</span>
                <span className="tabular-nums">{quota.today} / {quota.limit}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={
                    "h-full transition-all " +
                    (quota.pct >= 90 ? "bg-red-500" : quota.pct >= 70 ? "bg-amber-500" : "bg-emerald-500")
                  }
                  style={{ width: `${quota.pct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI-наблюдатель */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4" /> AI-наблюдатель</CardTitle>
          <CardDescription>Раз в час второй AI проверяет работу первого. Подозрительные паттерны попадают в уведомления HR.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {auditResult ? (
            <p className="text-[11px] text-muted-foreground">
              Последний аудит: {new Date(auditResult.ranAt).toLocaleString("ru-RU")}, найдено {auditResult.issuesCount} проблем
              {auditResult.summary ? ` — ${auditResult.summary}` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Аудит ещё не запускался в этой сессии.</p>
          )}
          <Button size="sm" variant="outline" onClick={runAudit} disabled={auditing} className="gap-1.5 h-8 text-xs">
            {auditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
            Запустить аудит сейчас
          </Button>
        </CardContent>
      </Card>

      {/* Modal: prompt preview */}
      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Системный промпт</DialogTitle></DialogHeader>
          <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded">{prompt}</pre>
        </DialogContent>
      </Dialog>

      {/* Modal: prompt edit */}
      <Dialog open={promptEditOpen} onOpenChange={setPromptEditOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Редактирование системного промпта</DialogTitle></DialogHeader>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Изменяя промпт вы берёте на себя ответственность за поведение AI.
          </p>
          <Textarea
            value={promptDraft}
            onChange={e => setPromptDraft(e.target.value)}
            rows={20}
            className="text-xs font-mono"
          />
          <p className="text-[11px] text-muted-foreground">{promptDraft.length} символов</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setPromptEditOpen(false)}>
              Отмена
            </Button>
            <Button
              size="sm"
              disabled={saving || !promptDraft.trim()}
              onClick={async () => {
                setPrompt(promptDraft)
                await save({ prompt: promptDraft })
                setPromptEditOpen(false)
              }}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Telegram instructions */}
      <Dialog open={tgModalOpen} onOpenChange={setTgModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Подключение Telegram-канала</DialogTitle></DialogHeader>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Создайте Telegram-канал (например, @company_hr_alerts).</li>
            <li>Добавьте <code>@ClaudeS24_Bot</code> как администратора канала.</li>
            <li>Введите название канала в поле выше (с @).</li>
            <li>Нажмите «Сохранить и проверить» — мы пришлём тестовое сообщение.</li>
          </ol>
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setTgModalOpen(false)}>Понятно</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
