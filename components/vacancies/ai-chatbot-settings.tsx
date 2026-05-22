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
import { Bot, Wand2, Eye, Shield, Send, Loader2, Save, Pencil } from "lucide-react"
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

interface Settings {
  triggers: Triggers
  confidenceThreshold: number  // 0..1
  dailyMessageLimit: number
  stopWordsOverride: boolean
  telegramChannel: string
  autoRejectOnAbuse: boolean
}
const DEFAULT_SETTINGS: Settings = {
  triggers: DEFAULT_TRIGGERS,
  confidenceThreshold: 0.7,
  dailyMessageLimit: 5,
  stopWordsOverride: true,
  telegramChannel: "",
  autoRejectOnAbuse: false,
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
        if (d.settings && typeof d.settings === "object") setSettings(s => ({ ...s, ...d.settings }))
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
            <Switch
              checked={enabled}
              disabled={!canEnable}
              onCheckedChange={v => { setEnabled(v); void save({ enabled: v }) }}
            />
          </div>
        </CardHeader>
      </Card>

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
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Автоотказ при оскорблениях</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">При confidence ≥ 0.7 кандидат с матом будет автоматически отклонён.</p>
            </div>
            <Switch checked={settings.autoRejectOnAbuse} onCheckedChange={v => setSettings(s => ({ ...s, autoRejectOnAbuse: v }))} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => save()} disabled={saving} className="gap-1.5 h-8 text-xs">
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
