"use client"

import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Role = "user" | "assistant"

interface Message {
  id: string
  role: Role
  content: string
  cited?: MaterialRef[]
}

interface MaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: "Привет! Я Ненси — Ненси базы знаний. Задайте вопрос — найду ответ в материалах компании.",
}

const SYSTEM_PROMPT =
  "Ты — Ненси, Ненси корпоративной базы знаний компании. " +
  "Отвечай на вопросы сотрудников ТОЛЬКО на основе предоставленных материалов. " +
  "Если ответ есть — дай краткий ответ и укажи название материала в скобках. " +
  "Если не найден — скажи что не нашёл и предложи создать материал. " +
  "Отвечай на русском, кратко, 2-4 предложения."

const CLAUDE_MODEL = "claude-sonnet-4-20250514"

function materialHref(m: MaterialRef): string {
  return m.type === "demo"
    ? `/hr/library/preview/${m.id}`
    : `/knowledge-v2/create/article?id=${m.id}`
}

// Build a Claude-compatible messages array from UI history.
// Claude requires strict alternation user → assistant → user → ... starting with user.
function buildClaudeMessages(history: Message[], question: string, context: string) {
  const candidates = history.filter((m) => m.id !== "welcome").slice(-4)
  const valid: Message[] = []
  for (let i = 0; i < candidates.length; i++) {
    const expected: Role = i % 2 === 0 ? "user" : "assistant"
    if (candidates[i].role !== expected) break
    valid.push(candidates[i])
  }
  // Must end with assistant so the new user turn can follow.
  if (valid.length % 2 !== 0) valid.pop()

  return [
    ...valid.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: `Материалы компании:\n${context}\n\nВопрос: ${question}`,
    },
  ]
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading, open])

  const send = async () => {
    const question = input.trim()
    if (!question || loading) return
    setInput("")

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: question }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      // 1. Server-side context lookup
      const searchRes = await fetch("/api/knowledge/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
      const searchData = await searchRes.json()
      if (!searchRes.ok) throw new Error(searchData.error || "Ошибка поиска")
      const context: string = searchData.context
      const materialsList: MaterialRef[] = Array.isArray(searchData.materialsList) ? searchData.materialsList : []

      // 2. Fetch API key (auth-gated)
      const keyRes = await fetch("/api/ai/key")
      const keyData = await keyRes.json()
      if (!keyRes.ok || !keyData.key) throw new Error(keyData.error || "API ключ недоступен")

      // 3. Call Claude directly from browser (RU server is blocked by Anthropic)
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": keyData.key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: buildClaudeMessages(messages, question, context),
        }),
      })

      if (!claudeRes.ok) {
        const body = await claudeRes.text().catch(() => "")
        console.error("[ai-assistant] Claude error", claudeRes.status, body)
        throw new Error("Claude API вернул ошибку")
      }

      const data = await claudeRes.json() as {
        content?: { type: string; text?: string }[]
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      const answer = data.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
      if (!answer) throw new Error("Пустой ответ от Claude")

      // 4. Find cited materials: any material whose name appears in the answer
      const lowered = answer.toLowerCase()
      const cited = materialsList
        .filter((m) => m.name && lowered.includes(m.name.toLowerCase()))
        .slice(0, 3)

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: answer, cited },
      ])

      // 5. Log usage (fire-and-forget)
      if (data.usage) {
        void fetch("/api/ai/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "knowledge_ask",
            inputTokens: data.usage.input_tokens ?? 0,
            outputTokens: data.usage.output_tokens ?? 0,
            model: CLAUDE_MODEL,
          }),
        }).catch((err) => console.error("[ai/log]", err))
      }
    } catch (err) {
      console.error("[ai-assistant]", err)
      const message = err instanceof Error ? err.message : "Не удалось получить ответ"
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: `Извините, ${message.toLowerCase()}. Попробуйте ещё раз.` },
      ])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Открыть Ненси"
          className="fixed bottom-4 right-4 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-50"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 w-96 h-[500px] rounded-2xl shadow-2xl border border-border bg-background flex flex-col z-50 animate-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-label="Ненси"
        >
          {/* Header */}
          <div className="bg-primary text-primary-foreground rounded-t-2xl px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-sm">🤖 Ненси</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              className="hover:opacity-80 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "rounded-2xl p-3 text-sm max-w-[85%]",
                    m.role === "user"
                      ? "bg-primary/10 rounded-br-sm ml-8"
                      : "bg-muted rounded-bl-sm mr-8",
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.cited && m.cited.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                      {m.cited.map((c) => (
                        <a
                          key={`${c.type}-${c.id}`}
                          href={materialHref(c)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-primary underline text-xs truncate"
                        >
                          {c.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-3 mr-8">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Задайте вопрос..."
              disabled={loading}
              className="h-9 text-sm"
            />
            <Button
              type="button"
              size="sm"
              onClick={send}
              disabled={loading || !input.trim()}
              className="h-9 px-3 shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
