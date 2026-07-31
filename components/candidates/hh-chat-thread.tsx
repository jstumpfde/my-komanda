"use client"

// Переиспользуемая «нить» hh-переписки одного кандидата.
// Пропсы: { hhResponseId, candidateName? }.
// Логика скопирована по образцу таба «История» в candidate-drawer.tsx
// (hhMessages / handleSendHhMessage / reload) — тот же GET/POST-эндпоинт
// /api/integrations/hh/messages/[hhResponseId]. Drawer намеренно НЕ трогаем,
// чтобы не рисковать регрессией; здесь — самостоятельный компонент.
//
// Обработка ошибок: hh может отклонить отправку (вакансия в архиве →
// invalid_vacancy, токен истёк, rate limit) — показываем понятную плашку/тост
// «hh не принял сообщение: …», UI не роняем.

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { linkifyText } from "@/lib/linkify"

interface HhMessage {
  id: string
  text: string
  authorType: string
  createdAt: string | null
  viewedByMe: boolean
  viewedByOpponent: boolean
}

interface HhChatThreadProps {
  hhResponseId: string
  candidateName?: string | null
  className?: string
}

export function HhChatThread({ hhResponseId, candidateName, className }: HhChatThreadProps) {
  const [messages, setMessages] = useState<HhMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(true)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch(`/api/integrations/hh/messages/${hhResponseId}`)
      const data = (await res.json()) as {
        messages?: HhMessage[]
        error?: string
        hhConnected?: boolean
      }
      if (!res.ok) {
        if (!silent) setError(data.error ?? `Ошибка ${res.status}`)
        return
      }
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setConnected(data.hhConnected !== false)
    } catch (err) {
      console.error("[hh-chat-thread] load failed", err)
      if (!silent) setError(err instanceof Error ? err.message : "Сетевая ошибка")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [hhResponseId])

  // Загрузка при смене кандидата.
  useEffect(() => {
    setMessages([])
    setDraft("")
    setError(null)
    setConnected(true)
    void load()
  }, [hhResponseId, load])

  // Автоскролл к последнему сообщению.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/integrations/hh/messages/${hhResponseId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      const data = (await res.json()) as { error?: string; details?: string }
      if (!res.ok) {
        // Понятный текст ошибки. hh отдаёт details при invalid_vacancy
        // (вакансия в архиве) / протухшем токене и т.п.
        const detail = data.details ? `: ${data.details}` : ""
        const msg = data.error
          ? `hh не принял сообщение: ${data.error}`
          : `hh не принял сообщение${detail}`
        toast.error(msg)
        setError(msg)
        return
      }
      setDraft("")
      setError(null)
      toast.success("Сообщение отправлено")
      await load(true)
    } catch (err) {
      console.error("[hh-chat-thread] send failed", err)
      toast.error("Сетевая ошибка при отправке")
    } finally {
      setSending(false)
    }
  }, [draft, sending, hhResponseId, load])

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {/* Лента сообщений */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка переписки…
          </div>
        ) : error && messages.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            {connected
              ? "Пока нет сообщений. Отправь первое — кандидат увидит в hh"
              : "Сохранённой переписки нет (hh не подключён)"}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.authorType === "employer"
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    // Потолок ширины пузыря: на широких экранах (инбокс/чаты)
                    // 80% давало строки во весь экран — нечитаемо (Юрий 02.07).
                    "max-w-[min(80%,620px)] rounded-lg px-3 py-2 text-xs space-y-1",
                    mine
                      ? "bg-indigo-500/10 text-foreground border border-indigo-500/20"
                      : "bg-muted/60 text-foreground border border-border/40",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{linkifyText(m.text)}</p>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/80">
                    <span>
                      {m.createdAt
                        ? new Date(m.createdAt).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                    {mine && (
                      <span title={m.viewedByOpponent ? "прочитано" : "не прочитано"}>
                        {m.viewedByOpponent ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Поле ввода / плашка «hh не подключён» */}
      {connected ? (
        <div className="pt-2 mt-2 border-t border-border/40 space-y-2 shrink-0">
          {/* Плашка ошибки отправки (например, вакансия в архиве на hh) */}
          {error && messages.length > 0 && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
              {error}
            </div>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={candidateName ? `Написать: ${candidateName}…` : "Написать кандидату…"}
            rows={3}
            disabled={sending}
            className="text-sm resize-none min-h-[72px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Ctrl+Enter — отправить</span>
            <Button size="sm" className="gap-2" disabled={!draft.trim() || sending} onClick={() => void handleSend()}>
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Отправить
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-2 mt-2 border-t border-amber-300/40 shrink-0">
          <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
            <p className="font-medium">hh не подключён</p>
            <p>Показана сохранённая переписка. Новые сообщения не подтянутся, отправка недоступна.</p>
            <a href="/hr/integrations" className="inline-block underline font-medium">
              Переподключить hh →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
