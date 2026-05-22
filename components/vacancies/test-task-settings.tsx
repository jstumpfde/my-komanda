"use client"

// Группа 19: минимальная UI-заглушка для блока «Тестовое задание».
// API: GET/PUT /api/modules/hr/vacancies/[id]/test-task.
// Хранение в vacancy.descriptionJson.testTask.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

type ResponseFormat = "text" | "file" | "both"

interface Props {
  vacancyId: string
  onSaved?: () => void
}

export function TestTaskSettings({ vacancyId, onSaved }: Props) {
  const [taskText, setTaskText] = useState("")
  const [deadlineDays, setDeadlineDays] = useState(3)
  const [aiCheck, setAiCheck] = useState(false)
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("text")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/test-task`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return
        const cfg = json?.config
        if (cfg && typeof cfg === "object") {
          if (typeof cfg.taskText === "string") setTaskText(cfg.taskText)
          if (typeof cfg.deadlineDays === "number") setDeadlineDays(cfg.deadlineDays)
          if (typeof cfg.aiCheck === "boolean") setAiCheck(cfg.aiCheck)
          if (cfg.responseFormat === "file" || cfg.responseFormat === "both" || cfg.responseFormat === "text") {
            setResponseFormat(cfg.responseFormat)
          }
        }
        setLoaded(true)
      })
      .catch(() => { setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/test-task`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ taskText, deadlineDays, aiCheck, responseFormat }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      toast.success("Тестовое задание сохранено")
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
        <CardTitle className="text-base">Тестовое задание</CardTitle>
        <CardDescription>
          Отдельная ступень воронки: задание → ответ кандидата → проверка.
          Применяется после анкеты, до интервью.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Текст задания для кандидата</Label>
          <Textarea
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="Опишите, что кандидат должен сделать..."
            rows={8}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Срок выполнения (дней)</Label>
          <Input
            type="number"
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(Number(e.target.value) || 3)}
            min={1}
            max={30}
            className="h-9 text-sm w-24"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Формат ответа</Label>
          <Select value={responseFormat} onValueChange={(v) => setResponseFormat(v as ResponseFormat)}>
            <SelectTrigger className="h-9 text-sm w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Текстовый ответ</SelectItem>
              <SelectItem value="file">Файл (PDF/DOC/ZIP)</SelectItem>
              <SelectItem value="both">Текст или файл</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm">AI-проверка ответа</Label>
            <p className="text-xs text-muted-foreground">AI оценит ответ кандидата по критериям задания</p>
          </div>
          <Switch checked={aiCheck} onCheckedChange={setAiCheck} />
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
