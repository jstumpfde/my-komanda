"use client"

// Группа 28: чат-виджет AI-помощника Юлии. Внутренний HR-ассистент для
// создания вакансии. Используется в Dialog поверх страницы /hr/vacancies/new.
//
// API: /api/modules/hr/yulia/conversations[/{id}/messages|/confirm-action|/reject-action]
// Поведение:
// - На монтировании создаёт диалог (POST /conversations) если нет conversationId
// - HR пишет сообщение → POST /messages → ответ Юлии
// - Если в ответе pending_action — рендерим карточку «Юлия предлагает создать»
// - Confirm → создаётся вакансия, callback onCreated(vacancyId)
// - Reject → /reject-action → Юлия снова в диалоге

import { useCallback, useEffect, useRef, useState } from "react"
import { Bot, Check, Loader2, Send, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface PendingAction {
  type:                   string
  params:                 Record<string, unknown>
  requires_confirmation?: boolean
}

interface YuliaMessage {
  id:              string
  role:            "user" | "assistant"
  content:         string
  pending_action?: PendingAction | null
  action_status?:  string | null
  created_at?:     string | Date
}

interface CreateVacancyParams {
  title?:        string
  city?:         string
  format?:       string
  salary_min?:   number
  salary_max?:   number
  description?:  string
  requirements?: {
    must_have?:     string[]
    nice_to_have?:  string[]
    deal_breakers?: string[]
    ideal_profile?: string
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU")
}

function PendingActionCard({
  action,
  onConfirm,
  onReject,
  loading,
}: {
  action:    PendingAction
  onConfirm: () => void
  onReject:  () => void
  loading:   boolean
}) {
  if (action.type !== "create_vacancy_draft") {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Неизвестное действие: {action.type}
      </div>
    )
  }
  const p = action.params as CreateVacancyParams
  const reqs = p.requirements
  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="text-xs font-semibold text-primary uppercase tracking-wide">
        Юлия предлагает создать вакансию
      </div>
      <ul className="space-y-1 text-sm">
        <li>• <span className="font-medium">{p.title ?? "—"}</span></li>
        {(p.city || p.format) && (
          <li>• {p.city || "Не указан город"}{p.format ? `, ${p.format}` : ""}</li>
        )}
        {(p.salary_min || p.salary_max) && (
          <li>• {p.salary_min ? formatNumber(p.salary_min) : "?"}–{p.salary_max ? formatNumber(p.salary_max) : "?"} ₽</li>
        )}
        {reqs?.must_have && reqs.must_have.length > 0 && (
          <li>• Требования: {reqs.must_have.length}</li>
        )}
        {p.description && (
          <li className="text-xs text-muted-foreground line-clamp-2">
            {p.description.slice(0, 200)}
          </li>
        )}
      </ul>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onConfirm} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Подтвердить
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={loading} className="gap-1.5">
          <X className="w-3.5 h-3.5" />
          Изменить
        </Button>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: YuliaMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
        isUser
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-muted rounded-bl-sm",
      )}>
        {message.content}
      </div>
    </div>
  )
}

export function YuliaChatWidget({
  onCreated,
  onClose,
}: {
  onCreated?: (vacancyId: string) => void
  onClose?:   () => void
}) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<YuliaMessage[]>([])
  const [input, setInput] = useState("")
  const [initLoading, setInitLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Создаём диалог при монтировании.
  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/hr/yulia/conversations", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ context_type: "vacancy_creation" }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`status_${r.status}`)))
      .then((data: { conversation_id: string; message: YuliaMessage }) => {
        if (cancelled) return
        setConversationId(data.conversation_id)
        setMessages([data.message])
      })
      .catch(err => {
        if (cancelled) return
        toast.error("Не удалось запустить Юлию")
        console.error(err)
      })
      .finally(() => { if (!cancelled) setInitLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Автоскролл вниз при новых сообщениях.
  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || !conversationId || sending) return
    const optimistic: YuliaMessage = {
      id:      `tmp_${Date.now()}`,
      role:    "user",
      content: text,
    }
    setMessages(prev => [...prev, optimistic])
    setInput("")
    setSending(true)
    try {
      const res = await fetch(`/api/modules/hr/yulia/conversations/${conversationId}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: text }),
      })
      if (!res.ok) throw new Error(`status_${res.status}`)
      const data = await res.json() as { message: YuliaMessage }
      setMessages(prev => [...prev, data.message])
    } catch (err) {
      toast.error("Юлия не ответила. Попробуй ещё раз.")
      console.error(err)
    } finally {
      setSending(false)
    }
  }, [input, conversationId, sending])

  const confirmAction = useCallback(async (messageId: string) => {
    if (!conversationId || confirming) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/modules/hr/yulia/conversations/${conversationId}/confirm-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message_id: messageId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(err?.error || `status_${res.status}`)
      }
      const data = await res.json() as { action_result: { vacancy_id: string; url: string } }
      toast.success("Черновик вакансии создан")
      onCreated?.(data.action_result.vacancy_id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать вакансию")
    } finally {
      setConfirming(false)
    }
  }, [conversationId, confirming, onCreated])

  const rejectAction = useCallback(async (messageId: string) => {
    if (!conversationId || confirming) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/modules/hr/yulia/conversations/${conversationId}/reject-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message_id: messageId }),
      })
      if (!res.ok) throw new Error(`status_${res.status}`)
      const data = await res.json() as { message: YuliaMessage }
      // Пометить сообщение rejected локально и добавить followup.
      setMessages(prev => [
        ...prev.map(m => m.id === messageId ? { ...m, action_status: "rejected" } : m),
        data.message,
      ])
    } catch (err) {
      toast.error("Не удалось отменить действие")
      console.error(err)
    } finally {
      setConfirming(false)
    }
  }, [conversationId, confirming])

  return (
    <div className="flex flex-col h-[600px] max-h-[80vh]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Юлия</div>
            <div className="text-xs text-muted-foreground">AI-помощник HR</div>
          </div>
        </div>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {initLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className="space-y-2">
              <MessageBubble message={m} />
              {m.role === "assistant" && m.pending_action && m.action_status === "pending" && (
                <PendingActionCard
                  action={m.pending_action}
                  onConfirm={() => confirmAction(m.id)}
                  onReject={() => rejectAction(m.id)}
                  loading={confirming}
                />
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Юлия печатает...
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
              sendMessage()
            }
          }}
          placeholder="Напиши Юле о вакансии..."
          rows={2}
          disabled={initLoading || sending}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={sendMessage}
            disabled={!input.trim() || sending || initLoading}
            className="gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Отправить
          </Button>
        </div>
      </div>
    </div>
  )
}
