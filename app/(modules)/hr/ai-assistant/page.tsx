"use client"

import { useState, useRef, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Bot, Send, Loader2, Sparkles, RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

const QUICK_PROMPTS = [
  "Как улучшить адаптацию новых сотрудников?",
  "Составь текст вакансии для менеджера по продажам",
  "Какие метрики HR самые важные?",
  "Как снизить текучесть кадров?",
  "Что делать если сотрудник выгорает?",
  "Расскажи про eNPS и как его измерять",
]

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return

    setInput("")
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: msg,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch("/api/modules/hr/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, sessionId }),
      })
      const data = await res.json()

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId)
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply || data.error || "Ошибка получения ответа",
        createdAt: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Ошибка соединения с AI. Проверьте ANTHROPIC_API_KEY в .env",
        createdAt: new Date().toISOString(),
      }])
    }
    setLoading(false)
  }

  const newSession = () => {
    setMessages([])
    setSessionId(null)
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="AI-ассистент" subtitle="Умный помощник для HR-задач" />
        <main className="flex flex-col h-[calc(100vh-64px)]">

          {/* Чат */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-4 rounded-2xl bg-primary/10 mb-4">
                  <Sparkles className="size-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">AI-ассистент my-komanda</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  Задайте вопрос о HR-процессах, попросите составить текст вакансии или проанализировать метрики.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {QUICK_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="text-left text-sm px-4 py-3 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/50 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="p-1.5 rounded-lg bg-primary/10 h-fit shrink-0">
                      <Bot className="size-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10 h-fit">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Ввод */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-2 max-w-3xl mx-auto">
              {messages.length > 0 && (
                <Button size="sm" variant="ghost" onClick={newSession} title="Новый чат">
                  <RotateCcw className="size-4" />
                </Button>
              )}
              <div className="flex-1 relative">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Задайте вопрос..."
                  disabled={loading}
                  className="pr-12"
                />
                <Button
                  size="sm"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                >
                  <Send className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
