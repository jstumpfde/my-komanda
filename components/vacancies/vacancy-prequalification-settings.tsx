"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, ClipboardList, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { VacancyAiProcessSettings, VacancyPrequalificationQuestion } from "@/lib/db/schema"

type PrequalificationMode = "direct_demo" | "prequal_then_demo" | "prequal_only"

const MODE_OPTIONS: { value: PrequalificationMode; label: string; desc: string; recommended?: boolean }[] = [
  {
    value: "direct_demo",
    label: "Сразу демо (без предквалификации)",
    desc:  "Кандидат после AI-скоринга резюме получает demo-ссылку. Текущее поведение.",
    recommended: true,
  },
  {
    value: "prequal_then_demo",
    label: "Сначала предквалификация → потом демо",
    desc:  "AI задаёт уточняющие вопросы. Если прошёл — отправляем demo, иначе — HR разбирает.",
    recommended: false,
  },
  {
    value: "prequal_only",
    label: "Только предквалификация (без демо)",
    desc:  "Demo не отправляется. После ответов кандидат сразу в стадию «Анкета» — HR продолжает руками.",
    recommended: false,
  },
]

interface Props {
  vacancyId: string
  initial?: VacancyAiProcessSettings | null
  onSaved?: () => void
}

const MAX_QUESTIONS = 3
const DEFAULT_REMINDER_D1 = "{{name}}, напомню — вы откликнулись на «{{vacancy}}». Ответьте, пожалуйста, на пару коротких вопросов, чтобы я мог двигаться дальше с вашей кандидатурой."
const DEFAULT_REMINDER_D3 = "{{name}}, ещё раз напоминаю про вопросы по «{{vacancy}}». Если не получу ответ — отправлю вам общую демонстрацию должности без уточнений."

function emptyQuestion(): VacancyPrequalificationQuestion {
  return { text: "", required: false, criterion: "" }
}

export function VacancyPrequalificationSettings({ vacancyId, initial, onSaved }: Props) {
  const cfg = initial?.prequalification

  // ТЗ-3 Ч.2: режим вместо тумблера. Старое значение enabled маппим на режим
  // только для отображения — глобальное правило живёт в prequalificationMode.
  const [mode, setMode] = useState<PrequalificationMode>(
    initial?.prequalificationMode ?? "direct_demo"
  )
  const [questions, setQuestions] = useState<VacancyPrequalificationQuestion[]>(
    () => (cfg?.questions ?? []).slice(0, MAX_QUESTIONS),
  )
  const [reminderD1, setReminderD1] = useState<string>(cfg?.reminderD1 ?? DEFAULT_REMINDER_D1)
  const [reminderD3, setReminderD3] = useState<string>(cfg?.reminderD3 ?? DEFAULT_REMINDER_D3)
  const [fallbackDays, setFallbackDays] = useState<number>(cfg?.fallbackDays ?? 5)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initial?.prequalificationMode) setMode(initial.prequalificationMode)
    const next = initial?.prequalification
    if (!next) return
    if (Array.isArray(next.questions)) setQuestions(next.questions.slice(0, MAX_QUESTIONS))
    if (typeof next.reminderD1 === "string" && next.reminderD1.length > 0) setReminderD1(next.reminderD1)
    if (typeof next.reminderD3 === "string" && next.reminderD3.length > 0) setReminderD3(next.reminderD3)
    if (typeof next.fallbackDays === "number") setFallbackDays(next.fallbackDays)
  }, [initial])

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return
    setQuestions([...questions, emptyQuestion()])
  }
  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx))
  }
  const updateQuestion = (idx: number, patch: Partial<VacancyPrequalificationQuestion>) => {
    setQuestions(questions.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prequalificationMode: mode,
          // Поддерживаем legacy enabled для совместимости с process-queue,
          // который читает prequalification.enabled при midRangeAction.
          prequalification: {
            enabled: mode !== "direct_demo",
            questions,
            reminderD1,
            reminderD3,
            fallbackDays,
          },
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "Не удалось сохранить")
      toast.success("Настройки предквалификации сохранены")
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const disabled = mode === "direct_demo"

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Предквалификация — уточняющие вопросы перед демо
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          AI задаёт до 3 уточняющих вопросов перед отправкой demo. Если режим
          «Только предквалификация» — кандидат после ответов попадает к HR в
          стадию «Анкета», без demo-ссылки.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Режим */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Режим предквалификации</Label>
          <div className="space-y-2">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                  mode === opt.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                  mode === opt.value ? "border-primary" : "border-muted-foreground/40"
                )}>
                  {mode === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    {opt.label}
                    {opt.recommended && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-300 text-emerald-700">
                        рекомендуется
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {!disabled && (
        <div className={cn("space-y-5 border-t pt-4")}>
        {/* Конструктор вопросов */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Вопросы (макс. {MAX_QUESTIONS})</Label>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 tabular-nums">{questions.length} / {MAX_QUESTIONS}</Badge>
          </div>

          {questions.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              Вопросов пока нет. Добавьте хотя бы один, чтобы предквалификация заработала.
            </p>
          )}

          {questions.map((q, idx) => (
            <div key={idx} className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Вопрос {idx + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeQuestion(idx)}
                  disabled={disabled}
                  className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                  Удалить
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-normal text-muted-foreground">Текст вопроса</Label>
                <Textarea
                  value={q.text}
                  onChange={e => updateQuestion(idx, { text: e.target.value })}
                  rows={2}
                  placeholder="Например: «Опишите ваш опыт работы с CRM-системами»"
                  disabled={disabled}
                  className="text-sm resize-y"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-normal text-muted-foreground">Критичность</Label>
                <div className="space-y-1">
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`q-${idx}-critical`}
                      checked={q.required}
                      onChange={() => updateQuestion(idx, { required: true })}
                      disabled={disabled}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Обязательный</span>
                      <span className="text-muted-foreground"> — если ответ не подходит, мягкий отказ.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`q-${idx}-critical`}
                      checked={!q.required}
                      onChange={() => updateQuestion(idx, { required: false })}
                      disabled={disabled}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Информативный</span>
                      <span className="text-muted-foreground"> — записываем в карточку, но не блокируем.</span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-normal text-muted-foreground">
                  Критерий правильного ответа <span className="text-muted-foreground/70">(опционально)</span>
                </Label>
                <Textarea
                  value={q.criterion}
                  onChange={e => updateQuestion(idx, { criterion: e.target.value })}
                  rows={2}
                  placeholder="Что AI считает правильным ответом. Например: «не менее 2 лет коммерческого опыта»"
                  disabled={disabled}
                  className="text-xs resize-y"
                />
              </div>
            </div>
          ))}

          {questions.length < MAX_QUESTIONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuestion}
              disabled={disabled}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить вопрос
            </Button>
          )}
        </div>

        {/* Напоминания */}
        <div className="space-y-3 border-t pt-4">
          <div>
            <Label className="text-sm font-medium">Напоминания при молчании</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Если кандидат не отвечает на вопросы — отправляем напоминания. После Д+{fallbackDays} без ответа — шлём демо без квалификации.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-normal text-muted-foreground">Напоминание Д+1 (через 1 день)</Label>
            <Textarea
              value={reminderD1}
              onChange={e => setReminderD1(e.target.value)}
              rows={2}
              disabled={disabled}
              className="text-sm resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-normal text-muted-foreground">Напоминание Д+3 (через 3 дня)</Label>
            <Textarea
              value={reminderD3}
              onChange={e => setReminderD3(e.target.value)}
              rows={2}
              disabled={disabled}
              className="text-sm resize-y"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Плейсхолдеры:{" "}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{name}}"}</code>,{" "}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{vacancy}}"}</code>.
          </p>
        </div>
        </div>
        )}

        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
