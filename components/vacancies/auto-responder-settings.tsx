"use client"

// Единый блок «Автоответы кандидату» — встроен в Портрет (spec-editor.tsx).
// Собирает в одном месте реакцию на входящие сообщения кандидата:
//   1. Стоп-слова → отказ (редактор списка живёт в vacancies.stopWordsJson,
//      сохраняется через .../vacancies/[id]/stop-words — переиспользуем
//      VacancyStopWordsSettings) + настройка РЕАКЦИИ на срабатывание
//      (прощальный текст + что делать со стадией).
//   2. Частые вопросы → авто-ответ (FAQ: keywords → reply), хранится в
//      vacancies.descriptionJson.autoResponder, API .../auto-responder.
// Один тумблер «Включить автоответы» — гейтит и стоп-слова-реакцию, и FAQ,
// в рантайме (lib/hh/scan-incoming.ts, lib/avito/scan-incoming.ts,
// lib/ai/chatbot-processor.ts). По умолчанию ВЫКЛ.

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Save, Loader2, Plus, X, MessageCircleQuestion, Ban } from "lucide-react"
import { VacancyStopWordsSettings } from "@/components/vacancies/vacancy-stop-words-settings"

interface FaqEntry {
  id:       string
  keywords: string[]
  reply:    string
}

type StopWordStageAction = "none" | "candidate_declined" | "reject"

interface AutoResponderConfig {
  enabled: boolean
  faq:     FaqEntry[]
  stopWordFarewellText: string
  stopWordStageAction:  StopWordStageAction
}

const EMPTY_CONFIG: AutoResponderConfig = {
  enabled: false, faq: [], stopWordFarewellText: "", stopWordStageAction: "none",
}

function newFaqId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const STAGE_ACTION_OPTIONS: Array<{ value: StopWordStageAction; label: string }> = [
  { value: "none",               label: "Не переводить (только прощание)" },
  { value: "candidate_declined", label: "Отказ по инициативе кандидата («Сам отказ.»)" },
  { value: "reject",             label: "Обычный отказ (по инициативе компании)" },
]

interface AutoResponderSettingsProps {
  vacancyId: string
}

export function AutoResponderSettings({ vacancyId }: AutoResponderSettingsProps) {
  const [config, setConfig]         = useState<AutoResponderConfig>(EMPTY_CONFIG)
  const [savedConfig, setSavedConfig] = useState<AutoResponderConfig>(EMPTY_CONFIG)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  // Стоп-слова живут отдельно (vacancies.stopWordsJson) — подтягиваем лёгким
  // GET вакансии, чтобы VacancyStopWordsSettings не стартовал с пустого списка.
  const [stopWords, setStopWords]   = useState<string[] | null>(null)
  const loadedOnce = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/auto-responder`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { autoResponder?: AutoResponderConfig } | null) => {
        if (cancelled || !d?.autoResponder) return
        setConfig(d.autoResponder)
        setSavedConfig(d.autoResponder)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setLoading(false); loadedOnce.current = true } })
    fetch(`/api/modules/hr/vacancies/${vacancyId}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { stopWordsJson?: string[] } | null) => {
        if (cancelled) return
        setStopWords(Array.isArray(d?.stopWordsJson) ? d.stopWordsJson : [])
      })
      .catch(() => { if (!cancelled) setStopWords([]) })
    return () => { cancelled = true }
  }, [vacancyId])

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig)

  const persist = async (next: AutoResponderConfig) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/auto-responder`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      const json = await res.json() as { autoResponder?: AutoResponderConfig }
      const saved = json.autoResponder ?? next
      setConfig(saved)
      setSavedConfig(saved)
      toast.success("Автоответы сохранены")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const patch = (p: Partial<AutoResponderConfig>) => setConfig(prev => ({ ...prev, ...p }))

  const addFaq = () => {
    patch({ faq: [...config.faq, { id: newFaqId(), keywords: [], reply: "" }] })
  }
  const removeFaq = (id: string) => {
    patch({ faq: config.faq.filter(f => f.id !== id) })
  }
  const updateFaq = (id: string, p: Partial<FaqEntry>) => {
    patch({ faq: config.faq.map(f => f.id === id ? { ...f, ...p } : f) })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Автоответы кандидату</CardTitle>
            <CardDescription>
              Единая реакция на входящие сообщения кандидата — работает независимо от
              режима (Портрет / Воронка v2 / AI чат-бот): стоп-слова → отказ и
              частые вопросы → авто-ответ.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              : dirty
                ? <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">
                    Не сохранено
                  </Badge>
                : null}
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={loading}
              aria-label="Включить автоответы"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Стоп-слова → отказ ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Стоп-слова → отказ</h4>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Список редактируется здесь, в Портрете. Если в сообщении кандидата встретится
            одно из этих слов — сработает реакция ниже.
          </p>
          <VacancyStopWordsSettings vacancyId={vacancyId} initial={stopWords} />

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">При стоп-слове</Label>
              <Select
                value={config.stopWordStageAction}
                onValueChange={(v) => patch({ stopWordStageAction: v as StopWordStageAction })}
                disabled={loading}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_ACTION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                По умолчанию «Не переводить» — стадия кандидата не меняется автоматически.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Прощальное сообщение (необязательно)</Label>
              <Textarea
                value={config.stopWordFarewellText}
                onChange={(e) => patch({ stopWordFarewellText: e.target.value })}
                placeholder="Спасибо, благодарим вас за интерес! Желаем вам всего хорошего."
                rows={3}
                className="text-sm resize-y"
                disabled={loading}
              />
              <p className="text-[11px] text-muted-foreground">
                Пусто → ничего не отправляем. Поддерживает {"{{name}}"}, {"{{vacancy}}"}.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Частые вопросы → авто-ответ ───────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Частые вопросы → авто-ответ</h4>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Если сообщение кандидата содержит одно из ключевых слов — отправляем готовый
            ответ вместо (или до) обычной обработки. Плейсхолдеры {"{{name}}"}, {"{{demo_link}}"},{" "}
            {"{{vacancy}}"} подставляются автоматически.
          </p>

          <div className="space-y-3">
            {config.faq.length === 0 && (
              <div className="text-xs text-muted-foreground italic border rounded-md px-3 py-3">
                Список пуст — добавьте первый вопрос.
              </div>
            )}
            {config.faq.map((entry, idx) => (
              <FaqRow
                key={entry.id}
                index={idx}
                entry={entry}
                disabled={loading}
                onChange={(p) => updateFaq(entry.id, p)}
                onRemove={() => removeFaq(entry.id)}
              />
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addFaq} disabled={loading} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Вопрос
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <div className="text-xs">
            {dirty ? (
              <span className="text-amber-700">Есть несохранённые изменения</span>
            ) : (
              <span className="text-muted-foreground">Изменений нет</span>
            )}
          </div>
          <Button size="sm" onClick={() => persist(config)} disabled={saving || loading || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? "Сохраняем..." : "Сохранить автоответы"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function FaqRow({
  index, entry, disabled, onChange, onRemove,
}: {
  index:    number
  entry:    FaqEntry
  disabled: boolean
  onChange: (p: Partial<FaqEntry>) => void
  onRemove: () => void
}) {
  const keywordsCsv = entry.keywords.join(", ")

  // Держим textarea-ввод ключевых слов «через запятую» как единую строку —
  // проще для HR, чем chip-редактор на каждую пару. Парсим в массив на blur.
  const [csvDraft, setCsvDraft] = useState(keywordsCsv)
  useEffect(() => { setCsvDraft(keywordsCsv) }, [keywordsCsv])

  const commitCsv = () => {
    const list = csvDraft.split(",").map(s => s.trim()).filter(Boolean)
    onChange({ keywords: list })
  }

  return (
    <div className="rounded-md border p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Вопрос {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Удалить"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ключевые слова (через запятую)</Label>
        <Input
          value={csvDraft}
          onChange={(e) => setCsvDraft(e.target.value)}
          onBlur={commitCsv}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCsv() } }}
          placeholder="зарплата, сколько платите, оклад"
          className="h-9 text-sm"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ответ</Label>
        <Textarea
          value={entry.reply}
          onChange={(e) => onChange({ reply: e.target.value })}
          placeholder="Зарплата указана в вакансии. Подробности и демо: {{demo_link}}"
          rows={2}
          className="text-sm resize-y"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
