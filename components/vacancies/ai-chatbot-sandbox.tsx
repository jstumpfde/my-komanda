"use client"

// Группа 33: песочница для тестирования AI чат-бота.
// Открывается из AiChatbotSettings, использует endpoint sandbox-message —
// прогоняет ту же логику processChatbotMessage с dryRun=true. Никаких
// записей в БД и отправок в hh.ru.

import { useEffect, useRef, useState } from "react"
import { Bot, Loader2, Send, Trash2, FlaskConical, AlertTriangle, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id:               string
  role:             "user" | "assistant"
  content:          string
  diagnostics?: {
    action?:          string
    category?:        string | null
    confidence?:      number | null
    escalationReason?: string | null
    preMessage?:      string | null
    preMessageDelayMs?: number | null
    replyDelayMs?:    number | null
  }
}

interface SandboxApiResponse {
  action:            string
  reply:             string | null
  preMessage:        string | null
  preMessageDelayMs: number | null
  replyDelayMs:      number | null
  category:          string | null
  confidence:        number | null
  escalationReason:  string | null
  diagnostics:       Record<string, unknown>
}

function shortConf(c: number | null | undefined): string {
  if (c == null) return ""
  return c.toFixed(2)
}

function actionBadgeClass(action?: string): string {
  if (action === "sent")      return "bg-green-100 text-green-800"
  if (action === "rejected")  return "bg-red-100 text-red-800"
  if (action === "escalated") return "bg-amber-100 text-amber-800"
  return "bg-gray-100 text-gray-700"
}

export function AiChatbotSandbox({
  vacancyId,
  onClose,
}: {
  vacancyId: string
  onClose?:  () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = {
      id:      `u_${Date.now()}`,
      role:    "user",
      content: text,
    }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setSending(true)

    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot/sandbox-message`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message: text,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || `status_${res.status}`)
      }
      const data = await res.json() as SandboxApiResponse

      // Имитируем тайминги. Если есть preMessage — показываем его сначала
      // через preMessageDelayMs, потом reply. Cap-им до 8 сек на UI чтобы
      // тестировать быстрее (реальные задержки могут быть до 5 мин).
      const cap = (ms: number | null) => ms == null ? 0 : Math.min(ms, 8_000)

      if (data.preMessage) {
        const preMsg: ChatMessage = {
          id:      `a_${Date.now()}_pre`,
          role:    "assistant",
          content: data.preMessage,
          diagnostics: {
            action:    "pre_message",
            preMessageDelayMs: data.preMessageDelayMs,
          },
        }
        setMessages(prev => [...prev, preMsg])
        await new Promise(r => setTimeout(r, cap(data.preMessageDelayMs)))
      }

      // Главная задержка перед основным ответом (для realism).
      if (data.replyDelayMs && data.replyDelayMs > 0) {
        await new Promise(r => setTimeout(r, cap(data.replyDelayMs)))
      }

      const assistantContent = data.reply ?? "(нет ответа)"
      const assistantMsg: ChatMessage = {
        id:      `a_${Date.now()}`,
        role:    "assistant",
        content: assistantContent,
        diagnostics: {
          action:           data.action,
          category:         data.category,
          confidence:       data.confidence,
          escalationReason: data.escalationReason,
          replyDelayMs:     data.replyDelayMs,
        },
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sandbox error")
    } finally {
      setSending(false)
    }
  }

  const clear = () => {
    if (sending) return
    setMessages([])
    setInput("")
  }

  return (
    <div className="flex flex-col h-[640px] max-h-[85vh]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Песочница AI чат-бота</div>
            <div className="text-xs text-muted-foreground">Тест-режим, ничего не отправляется</div>
          </div>
        </div>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="px-4 pt-3">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-[11px]">
            Сообщения не отправляются в hh.ru и не записываются в базу.
            Используются текущие настройки: промпт, триггеры, шаблоны отказов, тайминги.
            На UI задержки cap-нуты до 8 сек для удобства тестирования (реальные могут быть больше).
          </AlertDescription>
        </Alert>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            <Bot className="w-10 h-10 mx-auto mb-2 opacity-40" />
            Напишите сообщение как будто вы кандидат
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className="space-y-1">
            <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted rounded-bl-sm",
              )}>
                {m.content}
              </div>
            </div>
            {m.role === "assistant" && m.diagnostics && (
              <div className="text-[10px] text-muted-foreground pl-1 flex flex-wrap gap-2">
                {m.diagnostics.action && (
                  <span className={cn("px-1.5 py-0.5 rounded", actionBadgeClass(m.diagnostics.action))}>
                    {m.diagnostics.action}
                  </span>
                )}
                {m.diagnostics.category && (
                  <span>cat: {m.diagnostics.category} {shortConf(m.diagnostics.confidence)}</span>
                )}
                {m.diagnostics.escalationReason && (
                  <span>reason: {m.diagnostics.escalationReason}</span>
                )}
                {(m.diagnostics.preMessageDelayMs || m.diagnostics.replyDelayMs) && (
                  <span>
                    delay: {Math.round((m.diagnostics.preMessageDelayMs ?? m.diagnostics.replyDelayMs ?? 0) / 1000)}с
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              AI обрабатывает...
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3 space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Сообщение от лица кандидата..."
          rows={2}
          disabled={sending}
          className="resize-none text-sm"
        />
        <div className="flex justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={clear}
            disabled={sending || messages.length === 0}
            className="gap-1.5 h-8 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Очистить
          </Button>
          <Button
            size="sm"
            onClick={send}
            disabled={!input.trim() || sending}
            className="gap-1.5 h-8 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Отправить
          </Button>
        </div>
      </div>
    </div>
  )
}
