"use client"

import { useEffect, useRef, useState } from "react"
import { BarChart3, Zap, Target, Send, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RoutinePreviewCard, type RoutinePreview } from "./RoutinePreviewCard"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  preview?: RoutinePreview | null
}

const PRESETS: Array<{ label: string; icon: React.ElementType; insert: string }> = [
  { label: "Настроить отчёт",       icon: BarChart3, insert: "Хочу настроить отчёт по " },
  { label: "Добавить автоматизацию", icon: Zap,       insert: "Хочу автоматизацию: " },
  { label: "Настроить цели",         icon: Target,    insert: "Хочу настроить цель на " },
]

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Extracts text-before-json and parsed JSON from assistant reply. Accepts
// fenced ```json ... ``` as well as bare JSON after a prefix sentence.
function parseReply(reply: string): { text: string; preview: RoutinePreview | null } {
  const fenced = reply.match(/```json\s*([\s\S]*?)```/i)
  if (fenced) {
    const before = reply.slice(0, fenced.index ?? 0).trim()
    try {
      const preview = JSON.parse(fenced[1].trim()) as RoutinePreview
      return { text: before, preview }
    } catch {
      // fall through — render as text
    }
  }

  // Fallback: try to find a JSON object that looks like a routine
  const braceIdx = reply.indexOf("{")
  if (braceIdx !== -1) {
    const candidate = reply.slice(braceIdx)
    try {
      const parsed = JSON.parse(candidate) as RoutinePreview
      if (parsed && parsed.type === "routine") {
        return { text: reply.slice(0, braceIdx).trim(), preview: parsed }
      }
    } catch {}
  }

  return { text: reply.trim(), preview: null }
}

export function ConfiguratorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  async function send(rawText: string) {
    const text = rawText.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { id: uid(), role: "user", text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)

    try {
      const apiMessages = nextMessages.map((m) => ({
        role: m.role,
        content:
          m.role === "assistant" && m.preview
            ? `${m.text}\n\n\`\`\`json\n${JSON.stringify(m.preview, null, 2)}\n\`\`\``
            : m.text,
      }))

      const res = await fetch("/api/configurator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text:
              data?.error ??
              "Не удалось связаться с AI-движком Company24. Попробуйте ещё раз через минуту.",
          },
        ])
        return
      }

      const data = (await res.json()) as { reply: string }
      const { text: assistantText, preview } = parseReply(data.reply || "")

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: assistantText || (preview ? "Собрала для вас такую автоматизацию:" : ""),
          preview,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: "Нэнси сейчас не отвечает. Попробуйте через минуту.",
        },
      ])
    } finally {
      setLoading(false)
      // re-focus input
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  function handlePreset(text: string) {
    setInput(text)
    inputRef.current?.focus()
  }

  function handleEditPreview() {
    setInput("Измени: ")
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[520px] w-full max-w-3xl mx-auto rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Chat history */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {isEmpty && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground px-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center mb-4">
              <Sparkles className="size-6 text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Привет, я Нэнси</h3>
            <p className="text-sm mt-1.5 max-w-sm">
              Опишите словами, что нужно автоматизировать — я соберу рутину за пару секунд.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onEditPreview={handleEditPreview} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <Dot delay="0s" />
              <Dot delay="0.15s" />
              <Dot delay="0.3s" />
            </div>
            <span>Нэнси печатает…</span>
          </div>
        )}
      </div>

      {/* Presets */}
      {isEmpty && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePreset(p.insert)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 text-xs font-medium text-foreground/80 transition"
            >
              <p.icon className="size-3.5" />
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-background/60 p-3 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Например: Хочу каждое утро в 9:00 сводку по новым лидам в Telegram"
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[42px] max-h-40"
        />
        <Button
          type="submit"
          disabled={!input.trim() || loading}
          className="h-[42px] bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 border-0"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}

function MessageBubble({
  message,
  onEditPreview,
}: {
  message: ChatMessage
  onEditPreview: () => void
}) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-500 text-white px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 items-start max-w-full">
      <div className="flex items-start gap-2 max-w-[90%]">
        <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center mt-0.5">
          <Sparkles className="size-3.5" />
        </div>
        {message.text && (
          <div className="rounded-2xl rounded-tl-md bg-muted text-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
            {message.text}
          </div>
        )}
      </div>

      {message.preview && (
        <div className="pl-9 w-full max-w-[620px]">
          <RoutinePreviewCard data={message.preview} onEdit={onEditPreview} />
        </div>
      )}
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
      style={{ animationDelay: delay }}
    />
  )
}
