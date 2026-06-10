"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Send, Loader2, Lock, BookOpen } from "lucide-react"
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

export default function PublicAskPage() {
  const params = useParams()
  const code = (params?.code as string) || ""

  const [stage, setStage] = useState<"auth" | "chat">("auth")
  const [password, setPassword] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState("")

  const [token, setToken] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState("")

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim() || authLoading) return
    setAuthError("")
    setAuthLoading(true)
    try {
      const res = await fetch("/api/public/knowledge-chat/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password: password.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAuthError(data.error || "Неверный пароль")
        setAuthLoading(false)
        return
      }
      setToken(data.token)
      setCompanyName(data.companyName || "")
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Здравствуйте! Я Ненси — AI-ассистент базы знаний компании ${data.companyName || ""}. Задайте вопрос!`,
        },
      ])
      setStage("chat")
    } catch {
      setAuthError("Ошибка сети")
    }
    setAuthLoading(false)
  }

  const send = useCallback(async () => {
    const question = input.trim()
    if (!question || loading || !token) return
    setInput("")

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: question }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      // Ответ генерирует сервер (ключ Claude браузеру не передаётся)
      const res = await fetch("/api/public/knowledge-chat/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, question }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "AI API вернул ошибку")

      const { answer, materialsList } = data as {
        answer: string
        materialsList: MaterialRef[]
      }
      if (!answer) throw new Error("Пустой ответ")

      const lowered = answer.toLowerCase()
      const cited = Array.isArray(materialsList)
        ? materialsList.filter((m) => m.name && lowered.includes(m.name.toLowerCase())).slice(0, 3)
        : []

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: answer, cited },
      ])
    } catch (err) {
      console.error("[public-ask]", err)
      const message = err instanceof Error ? err.message : "Не удалось получить ответ"
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: `Извините, ${message.toLowerCase()}. Попробуйте позже.` },
      ])
    }
    setLoading(false)
  }, [input, loading, token])

  // ─── Auth screen ─────────────────────────────────────────────────────────

  if (stage === "auth") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-center">Доступ к базе знаний</h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Введите пароль, чтобы задать вопрос Ненси
            </p>
          </div>

          <form onSubmit={login} className="space-y-3">
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль доступа"
                className="h-11 pl-9"
                autoFocus
                disabled={authLoading}
              />
            </div>
            {authError && (
              <p className="text-xs text-destructive">{authError}</p>
            )}
            <Button type="submit" className="w-full h-11" disabled={authLoading || !password.trim()}>
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Войти
            </Button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Chat screen ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">🤖 Ненси — {companyName}</div>
          <div className="text-xs text-muted-foreground">База знаний</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "rounded-2xl p-3.5 text-sm max-w-[85%]",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm",
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.cited && m.cited.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                    {m.cited.map((c) => (
                      <div key={`${c.type}-${c.id}`} className="text-xs opacity-80 truncate">
                        📎 {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Задайте вопрос..."
            disabled={loading}
            className="h-11"
          />
          <Button onClick={send} disabled={loading || !input.trim()} className="h-11 px-4 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
