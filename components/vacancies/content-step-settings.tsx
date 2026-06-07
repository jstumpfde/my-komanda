"use client"

// Блок «Контент-шаг» для Конструктора воронки.
// Объединяет Презентацию / Демо / Тест / Тестовое задание в один блок.
// Режим персистируется в descriptionJson.contentStep.mode.
// Демо / Тест / Задание открывают те же реальные редакторы, что в отдельных вкладках.
// ТОЛЬКО для оценки UX — к рантайму и кандидатам НЕ подключён.

import { useEffect, useId, useState } from "react"
import { AlertCircle, ArrowRight, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { TestTaskSettings } from "@/components/vacancies/test-task-settings"

// ─── Типы ─────────────────────────────────────────────────────────────────────

export type ContentStepMode = "presentation" | "demo" | "test" | "task"

// ─── Константы ────────────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: ContentStepMode; label: string }[] = [
  { value: "presentation", label: "Презентация" },
  { value: "demo",         label: "Демонстрация" },
  { value: "test",         label: "Тест (вопросы)" },
  { value: "task",         label: "Тестовое задание" },
]

// ─── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  vacancyId: string
  onSaved?:  () => void
}

export function ContentStepSettings({ vacancyId, onSaved }: Props) {
  const uid = useId()

  // Поля только для режима «Презентация»
  const [mode, setMode]               = useState<ContentStepMode>("presentation")
  const [title, setTitle]             = useState("")
  const [description, setDescription] = useState("")

  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Загрузка из descriptionJson.contentStep
  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}`)
      .then(r => r.ok ? r.json() : null)
      .then((vacancy: {
        descriptionJson?: {
          contentStep?: {
            mode?: string
            title?: string
            description?: string
          }
        }
      } | null) => {
        if (cancelled) return
        const saved = vacancy?.descriptionJson?.contentStep
        if (saved && typeof saved === "object") {
          if (["presentation","demo","test","task"].includes(saved.mode ?? "")) {
            setMode(saved.mode as ContentStepMode)
          }
          if (typeof saved.title       === "string") setTitle(saved.title)
          if (typeof saved.description === "string") setDescription(saved.description)
        }
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  // ─── Смена режима: сохраняем mode на сервер сразу ──────────────────────────

  const changeMode = async (next: ContentStepMode) => {
    setMode(next)
    try {
      await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description_json: { contentStep: { mode: next } } }),
      })
    } catch {
      // тихо — это некритично, режим уже обновился локально
    }
  }

  // ─── Сохранение полей Презентации ──────────────────────────────────────────

  const savePresentation = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          description_json: { contentStep: { mode, title, description } },
        }),
      })
      if (!res.ok) throw new Error("Сервер вернул ошибку")
      toast.success("Презентация сохранена")
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

  return (
    <div className="space-y-4">

      {/* Информационная плашка */}
      <Alert className="border-blue-200 bg-blue-50 text-blue-800">
        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
        <AlertDescription className="text-xs leading-relaxed">
          <span className="font-semibold">Единый вход в шаги воронки.</span>{" "}
          Режим открывает настоящий редактор: Демонстрация и Тест — те же, что в отдельных
          вкладках (правки сохраняются туда же); Презентация — новый текстовый режим.
          Концепт оценки единого блока.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Контент-шаг</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Переключатель режима */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Режим блока</Label>
            <RadioGroup
              value={mode}
              onValueChange={v => changeMode(v as ContentStepMode)}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  htmlFor={`${uid}-mode-${opt.value}`}
                  className={[
                    "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors",
                    mode === opt.value
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

          {/* ─── Роутер по режиму ─────────────────────────────────────────── */}

          {/* Презентация — текстовый редактор (сохраняется кнопкой) */}
          {mode === "presentation" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-title`} className="text-xs font-medium">
                  Название
                </Label>
                <Input
                  id={`${uid}-title`}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Например: Обзор должности менеджера по продажам"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-desc`} className="text-xs font-medium">
                  Текст презентации
                </Label>
                <Textarea
                  id={`${uid}-desc`}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Опишите компанию, должность, условия — кандидат увидит этот текст…"
                  rows={6}
                  className="text-sm"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={savePresentation}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Save className="w-4 h-4" />}
                  {saving ? "Сохранение…" : "Сохранить"}
                </Button>
              </div>
            </div>
          )}

          {/* Демонстрация — открыть редактор в таб «Контент» (не встраиваем, тесно в Sheet 672px) */}
          {mode === "demo" && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Редактор демонстрации доступен в табе «Контент» вакансии.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={`/hr/vacancies/${vacancyId}?tab=content`} target="_blank" rel="noreferrer">
                  Открыть редактор демо
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </Button>
            </div>
          )}

          {/* Тест (квиз) — открыть редактор в таб «Контент» (не встраиваем, тесно в Sheet 672px) */}
          {mode === "test" && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Редактор квиза доступен в табе «Контент» вакансии.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={`/hr/vacancies/${vacancyId}?tab=content`} target="_blank" rel="noreferrer">
                  Открыть редактор квиза
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </Button>
            </div>
          )}

          {/* Тестовое задание — реальный редактор задания (самосохраняется) */}
          {mode === "task" && (
            <div className="border-t pt-4">
              <TestTaskSettings vacancyId={vacancyId} onSaved={onSaved} />
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}
