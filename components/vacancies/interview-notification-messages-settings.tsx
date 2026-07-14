"use client"

// 14.07 (осиротевшие настройки, Ф.А): два шаблона сообщений, у которых уже
// был API (PATCH /ai-settings принимает поля — vacancy-ai-process-settings.tsx
// соседствует с ними в том же VacancyAiProcessSettings/aiProcessSettings), но
// не было постоянного редактора в UI. Раньше значение можно было сохранить
// только «на лету» — как побочный эффект диалогов отмены/переноса интервью на
// /hr/interviews (кнопка «Сохранить как шаблон вакансии», см. saveMessageTemplate
// и saveRescheduleTemplate в app/(modules)/hr/interviews/page.tsx). Здесь —
// постоянные редакторы рядом с приглашением на интервью в «Коммуникациях».
//
//   meetingLinkMessage        — уходит кандидату, когда менеджер вставляет/меняет
//                                ссылку на встречу (Zoom и т.п.) в карточке интервью.
//                                Рендер: app/api/modules/hr/calendar/[id]/route.ts.
//   interviewCancelledMessage — уходит кандидату при отмене записи менеджером
//                                (НЕ отказ — приглашение выбрать новое время).
//                                Рендер: app/api/modules/hr/calendar/[id]/cancel-and-notify/route.ts
//                                и stage-message-preview/route.ts (предпросмотр).
//
// Пустое поле = платформенный дефолт (lib/hh/default-messages.ts), байт-в-байт —
// именно эти константы используются backend-fallback'ом.

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { Link2, CalendarX2, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { DEFAULT_MEETING_LINK_MESSAGE, DEFAULT_INTERVIEW_CANCELLED_MESSAGE } from "@/lib/hh/default-messages"

interface Props {
  vacancyId: string
  initial?: VacancyAiProcessSettings | null
  onSaved?: (settings: VacancyAiProcessSettings) => void
}

const TEXTAREA_CLASS =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-[var(--input-bg)] px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] resize-y min-h-16 leading-relaxed"

export function InterviewNotificationMessagesSettings({ vacancyId, initial, onSaved }: Props) {
  const [meetingLinkMessage, setMeetingLinkMessage] = useState(initial?.meetingLinkMessage ?? "")
  const [interviewCancelledMessage, setInterviewCancelledMessage] = useState(initial?.interviewCancelledMessage ?? "")
  const [saving, setSaving] = useState(false)
  const [savedBaseline, setSavedBaseline] = useState({
    meetingLinkMessage: initial?.meetingLinkMessage ?? "",
    interviewCancelledMessage: initial?.interviewCancelledMessage ?? "",
  })
  const meetingRef = useRef<HTMLTextAreaElement | null>(null)
  const cancelRef = useRef<HTMLTextAreaElement | null>(null)

  const dirty = meetingLinkMessage !== savedBaseline.meetingLinkMessage
    || interviewCancelledMessage !== savedBaseline.interviewCancelledMessage

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ meetingLinkMessage, interviewCancelledMessage }),
      })
      const data = await res.json().catch(() => null) as { ok?: boolean; settings?: VacancyAiProcessSettings; error?: string } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Не удалось сохранить")
      setSavedBaseline({ meetingLinkMessage, interviewCancelledMessage })
      if (data.settings) onSaved?.(data.settings)
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
          <CalendarX2 className="w-4 h-4" />
          Уведомления по интервью
        </CardTitle>
        <CardDescription className="mt-1">
          Автосообщения кандидату при действиях менеджера с уже назначенным интервью.
          Пустое поле — уходит стандартный текст.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
            Ссылка на встречу добавлена или изменена
          </div>
          <p className="text-[11px] text-muted-foreground">
            Уходит кандидату, когда менеджер вставляет или меняет ссылку (Zoom и т.п.) в карточке интервью.
          </p>
          <textarea
            ref={meetingRef}
            value={meetingLinkMessage}
            onChange={(e) => setMeetingLinkMessage(e.target.value)}
            placeholder={DEFAULT_MEETING_LINK_MESSAGE}
            rows={4}
            className={TEXTAREA_CLASS}
          />
          <PlaceholderBadges
            textareaRef={meetingRef}
            placeholders={["name", "vacancy", "meeting_link", "contacts"]}
            value={meetingLinkMessage}
            onValueChange={setMeetingLinkMessage}
          />
          <p className="text-[11px] text-muted-foreground">
            {"{{contacts}}"} — автоматически собранный блок контактов ответственного менеджера (если заполнены).
          </p>
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarX2 className="w-3.5 h-3.5 text-muted-foreground" />
            Интервью отменено менеджером
          </div>
          <p className="text-[11px] text-muted-foreground">
            Уходит кандидату при отмене записи менеджером — это не отказ, а приглашение выбрать новое время.
          </p>
          <textarea
            ref={cancelRef}
            value={interviewCancelledMessage}
            onChange={(e) => setInterviewCancelledMessage(e.target.value)}
            placeholder={DEFAULT_INTERVIEW_CANCELLED_MESSAGE}
            rows={4}
            className={TEXTAREA_CLASS}
          />
          <PlaceholderBadges
            textareaRef={cancelRef}
            placeholders={["name", "vacancy", "schedule_link"]}
            value={interviewCancelledMessage}
            onValueChange={setInterviewCancelledMessage}
          />
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
