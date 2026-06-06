"use client"

// Прототип блока «Контент-шаг» для Конструктора воронки.
// Объединяет Презентацию / Демо / Тест / Тестовое задание в один блок.
// ТОЛЬКО для оценки UX — к рантайму и кандидатам НЕ подключён.
// Данные сохраняются в vacancy.descriptionJson.contentStep (jsonb, свободная форма).

import { useEffect, useId, useState } from "react"
import { AlertCircle, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

// ─── Типы ─────────────────────────────────────────────────────────────────────

export type ContentStepMode = "presentation" | "demo" | "test" | "task"

export interface ContentStepQuestion {
  id:   string
  text: string
}

export interface ContentStepData {
  mode:         ContentStepMode
  title:        string
  description:  string
  questions:    ContentStepQuestion[]
  requiresFile: boolean
}

// ─── Константы ────────────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: ContentStepMode; label: string }[] = [
  { value: "presentation", label: "Презентация" },
  { value: "demo",         label: "Демонстрация" },
  { value: "test",         label: "Тест (вопросы)" },
  { value: "task",         label: "Тестовое задание" },
]

const DESCRIPTION_LABEL: Record<ContentStepMode, string> = {
  presentation: "Текст презентации",
  demo:         "Описание обзора",
  test:         "Вступление к тесту",
  task:         "Текст задания",
}

const DESCRIPTION_PLACEHOLDER: Record<ContentStepMode, string> = {
  presentation: "Опишите компанию, должность, условия — кандидат увидит этот текст…",
  demo:         "Опишите, что кандидат увидит в обзоре должности…",
  test:         "Напишите вступительное слово перед тестом…",
  task:         "Опишите задание: что сделать, в каком формате, какой результат ожидается…",
}

const DEFAULT_DATA: ContentStepData = {
  mode:         "presentation",
  title:        "",
  description:  "",
  questions:    [],
  requiresFile: false,
}

// ─── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  vacancyId: string
  onSaved?:  () => void
}

export function ContentStepSettings({ vacancyId, onSaved }: Props) {
  const uid = useId()

  const [data, setData]     = useState<ContentStepData>(DEFAULT_DATA)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Загрузка текущего значения из descriptionJson.contentStep
  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}`)
      .then(r => r.ok ? r.json() : null)
      .then((vacancy: { descriptionJson?: { contentStep?: Partial<ContentStepData> } } | null) => {
        if (cancelled) return
        const saved = vacancy?.descriptionJson?.contentStep
        if (saved && typeof saved === "object") {
          setData({
            mode:         (["presentation","demo","test","task"].includes(saved.mode ?? ""))
                            ? (saved.mode as ContentStepMode)
                            : "presentation",
            title:        typeof saved.title        === "string" ? saved.title        : "",
            description:  typeof saved.description  === "string" ? saved.description  : "",
            questions:    Array.isArray(saved.questions)
                            ? (saved.questions as ContentStepQuestion[]).filter(
                                q => q && typeof q.id === "string" && typeof q.text === "string"
                              )
                            : [],
            requiresFile: typeof saved.requiresFile === "boolean" ? saved.requiresFile : false,
          })
        }
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  // ─── Помощники ──────────────────────────────────────────────────────────────

  const set = <K extends keyof ContentStepData>(key: K, value: ContentStepData[K]) =>
    setData(prev => ({ ...prev, [key]: value }))

  const addQuestion = () =>
    set("questions", [
      ...data.questions,
      { id: `q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, text: "" },
    ])

  const updateQuestion = (id: string, text: string) =>
    set("questions", data.questions.map(q => q.id === id ? { ...q, text } : q))

  const removeQuestion = (id: string) =>
    set("questions", data.questions.filter(q => q.id !== id))

  // ─── Сохранение ─────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description_json: { contentStep: data } }),
      })
      if (!res.ok) throw new Error("Сервер вернул ошибку")
      toast.success("Контент-шаг сохранён")
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  // ─── Рендер ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Загрузка настроек…</span>
      </div>
    )
  }

  const showQuestions  = data.mode === "test" || data.mode === "task"
  const showFileToggle = data.mode === "task"

  return (
    <div className="space-y-4">

      {/* Плашка-прототип */}
      <Alert className="border-amber-200 bg-amber-50 text-amber-800">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
        <AlertDescription className="text-xs leading-relaxed">
          <span className="font-semibold">Прототип для оценки концепции.</span>{" "}
          В воронку и к кандидатам пока не подключён — это эксперимент с единым блоком
          вместо отдельных Демо&nbsp;/ Тест&nbsp;/ Презентации.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Контент-шаг</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Режим */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Режим блока</Label>
            <RadioGroup
              value={data.mode}
              onValueChange={v => set("mode", v as ContentStepMode)}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  htmlFor={`${uid}-mode-${opt.value}`}
                  className={[
                    "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors",
                    data.mode === opt.value
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-input hover:border-muted-foreground/50",
                  ].join(" ")}
                >
                  <RadioGroupItem
                    id={`${uid}-mode-${opt.value}`}
                    value={opt.value}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Название */}
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-title`} className="text-xs font-medium">
              Название
            </Label>
            <Input
              id={`${uid}-title`}
              value={data.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Например: Обзор должности менеджера по продажам"
              className="h-9 text-sm"
            />
          </div>

          {/* Описание — подпись меняется по режиму */}
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-desc`} className="text-xs font-medium">
              {DESCRIPTION_LABEL[data.mode]}
            </Label>
            <Textarea
              id={`${uid}-desc`}
              value={data.description}
              onChange={e => set("description", e.target.value)}
              placeholder={DESCRIPTION_PLACEHOLDER[data.mode]}
              rows={5}
              className="text-sm"
            />
          </div>

          {/* Вопросы — для режимов «Тест» и «Тестовое задание» */}
          {showQuestions && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  {data.mode === "test" ? "Вопросы теста" : "Вопросы к заданию (опционально)"}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={addQuestion}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить вопрос
                </Button>
              </div>

              {data.questions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Вопросов пока нет — нажмите «Добавить вопрос».
                </p>
              ) : (
                <div className="space-y-2">
                  {data.questions.map((q, idx) => (
                    <div key={q.id} className="flex items-start gap-2">
                      <span className="mt-2 shrink-0 text-xs text-muted-foreground w-5 text-right">
                        {idx + 1}.
                      </span>
                      <Input
                        value={q.text}
                        onChange={e => updateQuestion(q.id, e.target.value)}
                        placeholder={`Вопрос ${idx + 1}…`}
                        className="h-9 text-sm flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeQuestion(q.id)}
                        className="mt-2 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Удалить вопрос"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* «Требует файл/ответ» — только для «Тестового задания» */}
          {showFileToggle && (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-3">
              <div className="space-y-0.5">
                <Label
                  htmlFor={`${uid}-file`}
                  className="text-sm font-medium cursor-pointer"
                >
                  Требует файл или прикреплённый ответ
                </Label>
                <p className="text-xs text-muted-foreground">
                  Кандидат должен загрузить файл или прикрепить ответ к заданию.
                </p>
              </div>
              <Switch
                id={`${uid}-file`}
                checked={data.requiresFile}
                onCheckedChange={v => set("requiresFile", v)}
              />
            </div>
          )}

          {/* Кнопка сохранения */}
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
