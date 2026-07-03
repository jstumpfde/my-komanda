"use client"

// Диалог подтверждения «Пригласить на интервью» для действия advance
// (список/канбан вакансии, кнопка «Пригласить» → следующая стадия = interview).
// В отличие от полного диалога в карточке кандидата (candidate-drawer.tsx,
// два режима — ссылка/слоты), здесь только редактируемый текст (без выбора
// конкретных времён — то же поведение, что у молчаливого advance раньше).
//
// Юрий 03.07: НЕ переводить кандидата молча, когда следующая стадия — interview.
// Показываем окно с видом встречи + текстом приглашения (шаблон из
// GET /api/modules/hr/candidates/[id]/interview-invite). Чекбокс «Больше не
// показывать» — localStorage 'skipInterviewInviteConfirm' = '1'; если стоит,
// advance ведёт себя как раньше (тихо, interviewMode не передаётся).

import { useCallback, useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export const SKIP_INTERVIEW_INVITE_CONFIRM_KEY = "skipInterviewInviteConfirm"

export function shouldSkipInterviewInviteConfirm(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(SKIP_INTERVIEW_INVITE_CONFIRM_KEY) === "1"
  } catch {
    return false
  }
}

export type InterviewMeetMode = "phone" | "zoom" | "office"

const MEET_MODES: Array<{ v: InterviewMeetMode; label: string }> = [
  { v: "phone", label: "Звонок" },
  { v: "zoom", label: "Онлайн" },
  { v: "office", label: "В офис" },
]

export interface InterviewInviteConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateId: string | null
  candidateName?: string | null
  defaultInterviewMode?: InterviewMeetMode | null
  /** Отправка приглашения: PUT stage {stage:'interview', messageOverride, interviewMode}. */
  onConfirm: (args: { messageOverride: string; interviewMode: InterviewMeetMode }) => Promise<void> | void
}

export function InterviewInviteConfirm({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  defaultInterviewMode,
  onConfirm,
}: InterviewInviteConfirmProps) {
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState("")
  const [meetMode, setMeetMode] = useState<InterviewMeetMode>(defaultInterviewMode ?? "zoom")
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    if (!open || !candidateId) return
    setMeetMode(defaultInterviewMode ?? "zoom")
    setDontShowAgain(false)
    setText("")
    setLoading(true)
    fetch(`/api/modules/hr/candidates/${candidateId}/interview-invite`)
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        const d = (json?.data ?? json) as { scheduleInviteText?: string; defaultText?: string } | null
        const tmpl = (d?.scheduleInviteText && d.scheduleInviteText.trim().length > 0)
          ? d.scheduleInviteText
          : (d?.defaultText ?? "")
        setText(tmpl)
      })
      .catch(() => toast.error("Не удалось загрузить шаблон приглашения"))
      .finally(() => setLoading(false))
  }, [open, candidateId, defaultInterviewMode])

  const handleConfirm = useCallback(async () => {
    setSending(true)
    try {
      if (dontShowAgain && typeof window !== "undefined") {
        try { window.localStorage.setItem(SKIP_INTERVIEW_INVITE_CONFIRM_KEY, "1") } catch { /* ignore */ }
      }
      await onConfirm({ messageOverride: text, interviewMode: meetMode })
      onOpenChange(false)
    } finally {
      setSending(false)
    }
  }, [dontShowAgain, text, meetMode, onConfirm, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Пригласить на интервью{candidateName ? ` — ${candidateName}` : ""}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Вид встречи</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {MEET_MODES.map((m) => (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => setMeetMode(m.v)}
                    className={cn(
                      "text-sm px-2.5 py-1.5 rounded-md border transition-colors",
                      meetMode === m.v
                        ? "bg-purple-600 border-purple-600 text-white font-medium"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Текст приглашения</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Ссылка на самозапись подставится автоматически персонально.
              </p>
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="skip-interview-invite-confirm"
                checked={dontShowAgain}
                onCheckedChange={(v) => setDontShowAgain(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="skip-interview-invite-confirm" className="text-xs leading-snug cursor-pointer">
                Больше не показывать это окно
                <span className="block text-muted-foreground">
                  Приглашение со ссылкой будет отправляться кандидату сразу, без предпросмотра.
                </span>
              </label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Отмена</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={loading || sending}
            onClick={() => void handleConfirm()}
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
            Отправить приглашение
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
