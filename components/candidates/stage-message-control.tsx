"use client"

// Тумблер «Отправить сообщение кандидату» + предпросмотр шаблона.
//
// Используется в:
//   - диалоге отказа (карточка кандидата)
//   - quick-action смены стадии (карточка и список)
//   - bulk-панели (несколько кандидатов)
//
// Props:
//   stage       — целевая стадия
//   vacancyId   — для загрузки шаблона
//   sendMessage — внешнее состояние (управляется родителем)
//   onSendMessageChange
//   messageText — текст (управляется родителем, редактируемый)
//   onMessageTextChange
//   loading     — идёт загрузка предпросмотра

import { useEffect, useState, useRef } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, MessageSquare, MessageSquareOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface StageMessagePreview {
  hasMessage: boolean
  channel?:   "hh" | "follow_up"
  hhAction?:  string
  branch?:    string
  text?:      string
  note?:      string
  reason?:    string
}

const CHANNEL_LABEL: Record<string, string> = {
  hh:         "hh-чат",
  follow_up:  "hh-чат (отложено)",
}

interface StageMessageControlProps {
  stage:                 string | null
  vacancyId:             string | null
  sendMessage:           boolean
  onSendMessageChange:   (v: boolean) => void
  messageText:           string
  onMessageTextChange:   (v: string) => void
  /** Если true — компонент компактный (без заголовка секции) */
  compact?:              boolean
  className?:            string
  /** Сообщает родителю о состоянии предпросмотра (грузится / есть ли шаблон),
   *  чтобы кнопка сабмита не срабатывала до загрузки и тосты не врали
   *  о фактической отправке (guard 11.07). */
  onPreviewState?:       (s: { loading: boolean; hasMessage: boolean }) => void
}

export function StageMessageControl({
  stage,
  vacancyId,
  sendMessage,
  onSendMessageChange,
  messageText,
  onMessageTextChange,
  compact,
  className,
  onPreviewState,
}: StageMessageControlProps) {
  const [preview, setPreview]       = useState<StageMessagePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Флаг: был ли текст переопределён вручную HR'ом (тогда не перезаписываем при смене стадии)
  const dirtyRef = useRef(false)
  const prevStageRef = useRef<string | null>(null)
  // Актуальный колбэк без попадания в deps эффекта
  const onPreviewStateRef = useRef(onPreviewState)
  onPreviewStateRef.current = onPreviewState

  useEffect(() => {
    if (!stage || !vacancyId) {
      setPreview(null)
      onPreviewStateRef.current?.({ loading: false, hasMessage: false })
      return
    }

    // При смене стадии сбрасываем флаг «грязного» текста
    if (stage !== prevStageRef.current) {
      dirtyRef.current   = false
      prevStageRef.current = stage
    }

    let cancelled = false
    setPreviewLoading(true)
    onPreviewStateRef.current?.({ loading: true, hasMessage: false })
    fetch(`/api/modules/hr/candidates/stage-message-preview?stage=${encodeURIComponent(stage)}&vacancyId=${encodeURIComponent(vacancyId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: StageMessagePreview) => {
        if (cancelled) return
        setPreview(data)
        onPreviewStateRef.current?.({ loading: false, hasMessage: Boolean(data.hasMessage) })
        // Заполняем поле текстом из шаблона только если HR не редактировал
        if (!dirtyRef.current && data.hasMessage && data.text) {
          onMessageTextChange(data.text)
        }
        if (!data.hasMessage) {
          onMessageTextChange("")
        }
      })
      .catch(() => {
        if (cancelled) return
        setPreview(null)
        onPreviewStateRef.current?.({ loading: false, hasMessage: false })
        // Иначе при обрыве сети в поле остаётся текст ПРЕДЫДУЩЕЙ стадии
        // (напр. текст отмены записи уйдёт как текст отказа). Ручной ввод
        // HR (dirty) не трогаем.
        if (!dirtyRef.current) onMessageTextChange("")
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, vacancyId])

  // Нет стадии или вакансии — ничего не показываем
  if (!stage || !vacancyId) return null

  const hasMsg = preview?.hasMessage ?? false

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── Тумблер ── */}
      <div className="flex items-center gap-3">
        {previewLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
        ) : hasMsg ? (
          <MessageSquare className="size-4 text-primary shrink-0" />
        ) : (
          <MessageSquareOff className="size-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {hasMsg ? (
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="send-message-toggle"
                className="text-sm font-medium leading-none cursor-pointer select-none"
              >
                Отправить сообщение кандидату
              </Label>
              <Switch
                id="send-message-toggle"
                checked={sendMessage}
                onCheckedChange={onSendMessageChange}
                disabled={previewLoading}
                className="shrink-0"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {previewLoading
                ? "Проверяем шаблон сообщения…"
                : preview?.reason === "assessment_no_text"
                  ? "Меняет статус на hh — без сообщения в чат"
                  : "Для этой стадии сообщение не предусмотрено"}
            </p>
          )}
        </div>
      </div>

      {/* ── Предпросмотр и редактирование ── */}
      {hasMsg && sendMessage && !previewLoading && (
        <div className="space-y-1.5 pl-7">
          {preview?.channel && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {CHANNEL_LABEL[preview.channel] ?? preview.channel}
              </Badge>
              {preview.note && (
                <span className="text-[11px] text-muted-foreground">{preview.note}</span>
              )}
            </div>
          )}
          <Textarea
            value={messageText}
            onChange={(e) => {
              dirtyRef.current = true
              onMessageTextChange(e.target.value)
            }}
            rows={4}
            className="text-sm resize-none font-mono"
            placeholder="Текст сообщения…"
          />
          <p className="text-[11px] text-muted-foreground">
            Переменные: <code className="bg-muted px-1 rounded">{"{{name}}"}</code>,{" "}
            <code className="bg-muted px-1 rounded">{"{{vacancy}}"}</code>
            {stage === "interview_rescheduled" && (
              <>, <code className="bg-muted px-1 rounded">{"{{new_date}}"}</code>,{" "}
              <code className="bg-muted px-1 rounded">{"{{new_time}}"}</code></>
            )}
            {(preview?.branch === "schedule_invite" || stage === "interview_cancelled" || stage === "interview_rescheduled") && (
              <>, <code className="bg-muted px-1 rounded">{"{{schedule_link}}"}</code></>
            )}
            {preview?.hhAction === "invitation" && (
              <>, <code className="bg-muted px-1 rounded">{"{{demo_link}}"}</code></>
            )}
            {" "}— подставятся автоматически при отправке.
          </p>
        </div>
      )}
    </div>
  )
}
