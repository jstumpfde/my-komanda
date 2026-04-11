"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Target, Loader2, Send, ChevronLeft, RotateCcw, CheckCircle2, XCircle,
  Trophy, Lightbulb, Play,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Criterion {
  key: string
  label: string
}

interface Scenario {
  id: string
  title: string
  description: string | null
  type: string
  difficulty: string
  systemPrompt: string
  criteria: Criterion[]
}

interface Session {
  id: string
  messages: { role: "user" | "assistant"; content: string; createdAt: string }[]
  status: string
}

interface EvaluationCriterion {
  key: string
  label: string
  pass: boolean
  note: string
}

interface Evaluation {
  score: number
  criteria: EvaluationCriterion[]
  recommendations: string[]
}

const CLAUDE_MODEL = "claude-sonnet-4-20250514"
const MIN_TURNS_FOR_EVAL = 5
const MAX_TURNS_BEFORE_AUTO_EVAL = 10

export default function TrainingSessionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ─── Load scenario + active session + api key ─────────────────────────────

  useEffect(() => {
    if (!id) return
    void (async () => {
      setLoading(true)
      try {
        const [chatRes, keyRes] = await Promise.all([
          fetch(`/api/modules/knowledge/training/${id}/chat`),
          fetch("/api/ai/key"),
        ])

        if (!chatRes.ok) {
          toast.error("Сценарий не найден")
          setLoading(false)
          return
        }
        const chatData = (await chatRes.json()) as { scenario: Scenario; session: Session | null }
        setScenario(chatData.scenario)
        setSession(chatData.session)

        if (keyRes.ok) {
          const keyData = (await keyRes.json()) as { key?: string }
          setApiKey(keyData.key ?? null)
        }
      } catch {
        toast.error("Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [session?.messages, sending, evaluating])

  // ─── Start session ─────────────────────────────────────────────────────────

  async function handleStart() {
    if (!scenario) return
    setSending(true)
    try {
      const res = await fetch(`/api/modules/knowledge/training/${scenario.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      if (!res.ok) {
        toast.error("Не удалось начать тренировку")
        return
      }
      const data = (await res.json()) as { scenario: Scenario; session: Session }
      setSession(data.session)
      setEvaluation(null)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSending(false)
    }
  }

  // ─── Claude call (browser) ────────────────────────────────────────────────

  async function callClaudeReply(userText: string): Promise<string | null> {
    if (!apiKey || !scenario || !session) return null

    // Build messages history as alternating user/assistant
    const history = session.messages.map((m) => ({ role: m.role, content: m.content }))
    const payloadMessages = [...history, { role: "user", content: userText }]

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          system: scenario.systemPrompt,
          messages: payloadMessages,
        }),
      })
      if (!res.ok) {
        console.error("[training] Claude", res.status, await res.text().catch(() => ""))
        return null
      }
      const data = (await res.json()) as { content?: { type: string; text?: string }[] }
      return data.content?.find((c) => c.type === "text")?.text?.trim() ?? null
    } catch (err) {
      console.error("[training] Claude fetch failed", err)
      return null
    }
  }

  // ─── Claude evaluation call ───────────────────────────────────────────────

  async function callClaudeEvaluation(): Promise<Evaluation | null> {
    if (!apiKey || !scenario || !session) return null

    const transcript = session.messages
      .map((m) => `${m.role === "user" ? "Сотрудник" : "AI-персонаж"}: ${m.content}`)
      .join("\n\n")

    const criteriaList = scenario.criteria.map((c) => `- ${c.key}: ${c.label}`).join("\n")

    const prompt =
      `Диалог для оценки:\n\n${transcript}\n\n` +
      `Оцени сотрудника по критериям:\n${criteriaList}\n\n` +
      `Верни СТРОГО валидный JSON без markdown-блоков:\n` +
      `{"score": 0-100, "criteria": [{"key": "...", "label": "...", "pass": true|false, "note": "..."}], "recommendations": ["...", "..."]}`

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system:
            "Ты строгий но справедливый эксперт по обучению. Оцени диалог по критериям и верни только валидный JSON.",
          messages: [{ role: "user", content: prompt }],
        }),
      })
      if (!res.ok) {
        console.error("[training] Eval Claude", res.status)
        return null
      }
      const data = (await res.json()) as { content?: { type: string; text?: string }[] }
      const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
      const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim()
      const parsed = JSON.parse(cleaned) as Evaluation
      return parsed
    } catch (err) {
      console.error("[training] Eval parse failed", err)
      return null
    }
  }

  // ─── Send a turn ───────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim()
    if (!text || !scenario || !session || sending) return
    if (!apiKey) {
      toast.error("AI недоступен — нет API ключа")
      return
    }

    setInput("")
    setSending(true)

    // Optimistic user message
    const optimistic: Session = {
      ...session,
      messages: [
        ...session.messages,
        { role: "user", content: text, createdAt: new Date().toISOString() },
      ],
    }
    setSession(optimistic)

    const reply = await callClaudeReply(text)
    if (!reply) {
      toast.error("AI не ответил — попробуйте ещё раз")
      setSending(false)
      // Откатываем оптимистичное сообщение
      setSession(session)
      return
    }

    const updated: Session = {
      ...optimistic,
      messages: [
        ...optimistic.messages,
        { role: "assistant", content: reply, createdAt: new Date().toISOString() },
      ],
    }
    setSession(updated)

    // Persist to server
    try {
      await fetch(`/api/modules/knowledge/training/${scenario.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "append",
          userMessage: text,
          assistantMessage: reply,
        }),
      })
    } catch {
      // ignore — UI уже обновлён
    }

    setSending(false)

    // Auto-evaluate after 10 turns
    const userTurns = updated.messages.filter((m) => m.role === "user").length
    if (userTurns >= MAX_TURNS_BEFORE_AUTO_EVAL) {
      void handleEvaluate(updated)
    }
  }

  // ─── Evaluate ──────────────────────────────────────────────────────────────

  async function handleEvaluate(overrideSession?: Session) {
    const s = overrideSession ?? session
    if (!s || !scenario || evaluating) return
    if (!apiKey) {
      toast.error("AI недоступен — нет API ключа")
      return
    }
    const userTurns = s.messages.filter((m) => m.role === "user").length
    if (userTurns < MIN_TURNS_FOR_EVAL) {
      toast.error(`Нужно минимум ${MIN_TURNS_FOR_EVAL} реплик для оценки`)
      return
    }

    setEvaluating(true)
    try {
      const evalResult = await callClaudeEvaluation()
      if (!evalResult) {
        toast.error("Не удалось получить оценку")
        return
      }
      setEvaluation(evalResult)

      // Persist
      await fetch(`/api/modules/knowledge/training/${scenario.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          score: evalResult.score,
          evaluation: {
            criteria: evalResult.criteria,
            recommendations: evalResult.recommendations,
          },
        }),
      })
    } finally {
      setEvaluating(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const userTurns = session?.messages.filter((m) => m.role === "user").length ?? 0
  const canEvaluate = userTurns >= MIN_TURNS_FOR_EVAL && !evaluation
  const sessionStarted = Boolean(session)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-hidden bg-background min-w-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Загрузка...
            </div>
          ) : !scenario ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Сценарий не найден
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="border-b px-6 py-3 flex items-center gap-3" style={{ paddingLeft: 56, paddingRight: 56 }}>
                <Button variant="ghost" size="sm" onClick={() => router.push("/knowledge-v2/training")} className="gap-1">
                  <ChevronLeft className="size-4" />
                  Все тренировки
                </Button>
                <div className="h-5 w-px bg-border" />
                <Target className="size-4 text-violet-500" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{scenario.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{scenario.description}</p>
                </div>
                {sessionStarted && !evaluation && (
                  <>
                    <Badge variant="secondary" className="text-[10px]">
                      {userTurns} / {MAX_TURNS_BEFORE_AUTO_EVAL} реплик
                    </Badge>
                    {canEvaluate && (
                      <Button size="sm" onClick={() => handleEvaluate()} disabled={evaluating}>
                        {evaluating ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                        Завершить и оценить
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-hidden flex flex-col" style={{ paddingLeft: 56, paddingRight: 56 }}>
                {!sessionStarted ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="p-4 rounded-full bg-violet-500/10">
                      <Target className="size-10 text-violet-500" />
                    </div>
                    <h2 className="text-xl font-semibold">{scenario.title}</h2>
                    {scenario.description && (
                      <p className="text-sm text-muted-foreground max-w-lg">{scenario.description}</p>
                    )}
                    <div className="rounded-lg bg-muted/50 p-4 max-w-lg text-left">
                      <p className="text-xs font-semibold mb-2">Оцениваться будет:</p>
                      <ul className="space-y-1">
                        {scenario.criteria.map((c) => (
                          <li key={c.key} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-violet-500">•</span>
                            <span>{c.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button size="lg" onClick={handleStart} disabled={sending || !apiKey} className="gap-2">
                      {sending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                      Начать тренировку
                    </Button>
                    {!apiKey && (
                      <p className="text-xs text-destructive">API ключ Claude не настроен</p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-auto py-6 space-y-4">
                      {session!.messages.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-8">
                          Напишите первую реплику чтобы начать диалог
                        </div>
                      )}
                      {session!.messages.map((m, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-3",
                            m.role === "user" ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                              m.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                      {sending && (
                        <div className="flex justify-start">
                          <div className="bg-muted rounded-2xl px-4 py-2.5">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          </div>
                        </div>
                      )}

                      {/* Evaluation */}
                      {evaluation && (
                        <div className="rounded-xl border p-6 bg-card space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="p-3 rounded-full bg-violet-500/15">
                              <Trophy className="size-6 text-violet-500" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold">Результат тренировки</p>
                              <p className="text-xs text-muted-foreground">Итоговая оценка AI</p>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold tabular-nums">{evaluation.score}</div>
                              <div className="text-xs text-muted-foreground">из 100</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {evaluation.criteria.map((c) => (
                              <div key={c.key} className="flex items-start gap-2 text-sm">
                                {c.pass ? (
                                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium">{c.label}</p>
                                  <p className="text-xs text-muted-foreground">{c.note}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {evaluation.recommendations?.length > 0 && (
                            <div className="rounded-lg bg-amber-500/10 p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Lightbulb className="size-3.5 text-amber-600" />
                                <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                                  Рекомендации
                                </p>
                              </div>
                              <ul className="space-y-1">
                                {evaluation.recommendations.map((r, i) => (
                                  <li key={i} className="text-xs text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                                    <span>{i + 1}.</span>
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1 gap-1.5" onClick={handleStart}>
                              <RotateCcw className="size-3.5" />
                              Пройти заново
                            </Button>
                            <Link href="/knowledge-v2/training" className="flex-1">
                              <Button variant="outline" className="w-full">К списку</Button>
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Input */}
                    {!evaluation && (
                      <div className="border-t py-4">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Ваша реплика..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                            disabled={sending || evaluating || !apiKey}
                            className="flex-1"
                          />
                          <Button
                            onClick={handleSend}
                            disabled={!input.trim() || sending || evaluating || !apiKey}
                          >
                            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
