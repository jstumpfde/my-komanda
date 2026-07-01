"use client"

// Настраиваемый текст приглашения на интервью (ссылка /schedule/[token]).
//
// Отправляется кандидату при переходе в стадию «Интервью» (через cron
// follow-up, branch='schedule_invite'). Пустое поле → используется
// DEFAULT_SCHEDULE_INVITE_TEXT (lib/messaging/schedule-invite.ts), никакого
// hardcoded fallback в БД. Разовый override из карточки кандидата имеет
// приоритет над этим текстом.
//
// Хранение: vacancies.schedule_invite_text (dedicated column, миграция 0238),
// PUT /api/modules/hr/vacancies/[id]/schedule-invite. Тот же паттерн, что и
// RecoveryMessageSettings — отдельная колонка, чтобы не зависеть от общего
// PUT descriptionJson в AutomationSettings.

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { CalendarClock, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Props {
  vacancyId: string
  initialText?: string | null
  /** Дефолтный текст (DEFAULT_SCHEDULE_INVITE_TEXT) — показываем в placeholder,
   *  чтобы HR видел, что уйдёт кандидату при пустом поле. */
  defaultText?: string
  onSaved?: () => void
}

const PLACEHOLDER_TOKENS = ["name", "vacancy", "company", "schedule_link", "manager"]

export function ScheduleInviteSettings({ vacancyId, initialText, defaultText = "", onSaved }: Props) {
  const [text, setText] = useState(typeof initialText === "string" ? initialText : "")
  const [savedText, setSavedText] = useState(typeof initialText === "string" ? initialText : "")
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const dirty = text !== savedText

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-invite`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
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
          <CalendarClock className="w-4 h-4" />
          Приглашение на интервью
        </CardTitle>
        <CardDescription className="mt-1">
          Отправляется кандидату при переводе в стадию «Интервью» — вместе с
          персональной ссылкой на выбор времени ({"{{schedule_link}}"}). Если поле
          пустое — используется стандартный текст.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={defaultText || "Стандартный текст приглашения на интервью…"}
            rows={9}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-[var(--input-bg)] px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] resize-y min-h-16 leading-relaxed"
          />
          <PlaceholderBadges
            textareaRef={textareaRef}
            placeholders={PLACEHOLDER_TOKENS}
            value={text}
            onValueChange={setText}
          />
          <p className="text-[11px] text-muted-foreground">
            {"{{manager}}"} — имя ответственного менеджера (если задан),
            {" "}{"{{company}}"} — название компании. Пустое поле → уйдёт стандартный текст.
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
