"use client"

// Группа 19: минимальная UI-заглушка для блока «Реф-чек».
// API: GET/PUT /api/modules/hr/vacancies/[id]/reference-check.
// Хранение в vacancy.descriptionJson.referenceCheck.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

interface Props {
  vacancyId: string
  onSaved?: () => void
}

const DEFAULT_QUESTIONS = [
  "Как давно работал кандидат в вашей компании?",
  "Какие задачи выполнял?",
  "Сильные и слабые стороны?",
  "Причина увольнения?",
  "Взяли бы обратно?",
].join("\n")

export function ReferenceCheckSettings({ vacancyId, onSaved }: Props) {
  const [questionsText, setQuestionsText] = useState(DEFAULT_QUESTIONS)
  const [required, setRequired] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/reference-check`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return
        const cfg = json?.config
        if (cfg && typeof cfg === "object") {
          if (Array.isArray(cfg.questions) && cfg.questions.length > 0) {
            setQuestionsText(cfg.questions.join("\n"))
          }
          if (typeof cfg.required === "boolean") setRequired(cfg.required)
        }
        setLoaded(true)
      })
      .catch(() => { setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async () => {
    setSaving(true)
    try {
      const questions = questionsText
        .split("\n")
        .map(q => q.trim())
        .filter(q => q.length > 0)
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/reference-check`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ questions, required }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      toast.success("Настройки реф-чека сохранены")
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Реф-чек</CardTitle>
        <CardDescription>
          Список вопросов прошлым работодателям кандидата. Один вопрос на строку.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Вопросы (по одному на строку)</Label>
          <Textarea
            value={questionsText}
            onChange={(e) => setQuestionsText(e.target.value)}
            rows={10}
            className="text-sm font-mono"
          />
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm">Обязательный шаг</Label>
            <p className="text-xs text-muted-foreground">Кандидат не пройдёт дальше без реф-чека</p>
          </div>
          <Switch checked={required} onCheckedChange={setRequired} />
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
