"use client"

// Настраиваемый текст мягкого напоминания «пройдите Демо-3 до интервью».
//
// Ставится кандидату (branch='demo3_before_interview', через cron follow-up),
// когда он записался на интервью / переведён в стадию «Интервью», но НЕ прошёл
// последний демо-блок вакансии. Пустое поле → используется
// DEFAULT_DEMO3_BEFORE_INTERVIEW_TEXT (lib/messaging/demo3-before-interview.ts),
// без hardcoded fallback в БД.
//
// Хранение: vacancies.demo3_before_interview_text (отдельная колонка,
// миграция 0279), PUT /api/modules/hr/vacancies/[id] (поле
// demo3_before_interview_text). Тот же паттерн, что ScheduleInviteSettings.

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { GraduationCap, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

interface Props {
  vacancyId: string
  initialText?: string | null
  onSaved?: () => void
}

const PLACEHOLDER_TOKENS = ["name", "vacancy", "company", "manager", "demo3_link"]

export function Demo3BeforeInterviewSettings({ vacancyId, initialText, onSaved }: Props) {
  const [text, setText] = useState(typeof initialText === "string" ? initialText : "")
  const [savedText, setSavedText] = useState(typeof initialText === "string" ? initialText : "")
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const dirty = text !== savedText

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ demo3_before_interview_text: text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      setSavedText(text)
      onSaved?.()
      toast.success("Сохранено")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4" />
          Напоминание про Демо-3 перед интервью
        </CardTitle>
        <CardDescription className="mt-1">
          Мягко напоминает кандидату пройти последний демо-блок ({"{{demo3_link}}"}),
          если он записался на интервью или переведён в стадию «Интервью», но ещё
          его не прошёл. Ставится один раз. Если поле пустое — используется
          стандартный текст. Срабатывает только у вакансий с несколькими демо-блоками.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="{{name}}, пожалуйста, пройдите Демо-3 до интервью — это очень важно: {{demo3_link}}"
            rows={6}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-[var(--input-bg)] px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] resize-y min-h-16 leading-relaxed"
          />
          <PlaceholderBadges
            textareaRef={textareaRef}
            placeholders={PLACEHOLDER_TOKENS}
            value={text}
            onValueChange={setText}
          />
          <p className="text-[11px] text-muted-foreground">
            {"{{demo3_link}}"} — персональная ссылка на последний демо-блок.
            Если не добавить — она допишется в конец автоматически. Пустое поле → уйдёт стандартный текст.
          </p>
        </div>

        {dirty && (
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
