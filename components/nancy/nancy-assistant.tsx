"use client"

// components/nancy/nancy-assistant.tsx
//
// Единый ассистент Нэнси — объединяет AiAssistantWidget + голосовую Nancy.
//
// Возможности:
//  - Аватар nancy-avatar.png, «N» как fallback
//  - Модуль-aware: приветствие и промпт меняются под раздел платформы
//  - Knowledge-search: для /knowledge /learning /hr/adaptation ищет материалы
//    через /api/knowledge/ai-search перед отправкой
//  - Сохранить в базу знаний (BookmarkPlus)
//  - Цитируемые источники из KB
//  - Развернуть на весь экран
//  - HR-действия: fill_outbound / search_outbound / navigate (window events)
//  - TTS: Yandex SpeechKit (Алёна) → browser SpeechSynthesis fallback
//  - STT: запись PCM (Web Audio API) → Yandex SpeechKit STT
//         (работает в Safari/Chrome/Yandex, hands-free режим разговора)

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import {
  Mic, MicOff, X, Send, Loader2, Volume2,
  Maximize2, Minimize2, BookmarkPlus, Check, PhoneCall,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  ensureMic, releaseMic, listenOnce, micSupported as micIsSupported,
  type ListenHandle,
} from "@/lib/voice/record-pcm"

// ─── Типы ──────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: "user" | "nancy"
  text: string
  cited?: Array<{ id: string; name: string; type: "demo" | "article" }>
  saved?: boolean
}

interface NancyAction {
  type: "fill_outbound" | "search_outbound" | "navigate"
  textClauses?: Array<{ text: string; field: string }>
  area?: string
  experience?: string
  softCriteria?: string
  href?: string
}

// ─── Модуль-контекст ────────────────────────────────────────────────────────

type ModuleCtx =
  | "knowledge" | "learning" | "hr" | "onboarding"
  | "sales" | "tasks" | "marketing" | "logistics" | "platform"

function detectModule(pathname: string): ModuleCtx {
  if (pathname.startsWith("/knowledge")) return "knowledge"
  if (pathname.startsWith("/learning"))  return "learning"
  if (pathname.startsWith("/hr/adaptation") || pathname.startsWith("/hr/onboarding")) return "onboarding"
  if (pathname.startsWith("/hr"))        return "hr"
  if (pathname.startsWith("/sales"))     return "sales"
  if (pathname.startsWith("/tasks"))     return "tasks"
  if (pathname.startsWith("/marketing")) return "marketing"
  if (pathname.startsWith("/logistics")) return "logistics"
  return "platform"
}

// Нужно ли загружать материалы из базы знаний перед отправкой
function needsKnowledgeSearch(mod: ModuleCtx): boolean {
  return mod === "knowledge" || mod === "learning" || mod === "onboarding"
}

const WELCOME: Record<ModuleCtx, string> = {
  knowledge:  "Привет! Я Нэнси. Помогу найти материал в базе знаний или создать документ.",
  learning:   "Привет! Я Нэнси. Помогу с курсами, тренировками и планами обучения.",
  hr:         "Привет! Я Нэнси. Помогу с вакансиями, кандидатами и поиском резюме.",
  onboarding: "Привет! Я Нэнси — твой AI-наставник. Спрашивай что угодно о компании.",
  sales:      "Привет! Я Нэнси. Помогу с клиентами, сделками и воронкой продаж.",
  tasks:      "Привет! Я Нэнси. Помогу с задачами и приоритизацией.",
  marketing:  "Привет! Я Нэнси. Помогу с кампаниями и контентом.",
  logistics:  "Привет! Я Нэнси. Помогу со складами и заказами.",
  platform:   "Привет! Я Нэнси — AI-ассистент Company24. Чем помочь?",
}

// ─── Определяем pathname-контекст для API ──────────────────────────────────

function pageLabel(pathname: string): string {
  if (pathname.includes("/hr/vacancies/")) {
    const id = pathname.match(/\/hr\/vacancies\/([^/]+)/)?.[1]
    return `Страница вакансии${id ? ` (id: ${id})` : ""}`
  }
  if (pathname.startsWith("/hr/vacancies"))   return "Список вакансий"
  if (pathname.startsWith("/hr/calendar"))    return "Календарь"
  if (pathname.startsWith("/hr/candidates"))  return "Кандидаты"
  if (pathname.startsWith("/hr/interviews"))  return "Интервью"
  if (pathname.startsWith("/team"))           return "Команда"
  if (pathname.startsWith("/settings"))       return "Настройки"
  if (pathname.startsWith("/knowledge"))      return "База знаний"
  if (pathname.startsWith("/learning"))       return "Обучение"
  return pathname
}

// ─── TTS: Yandex → browser fallback ────────────────────────────────────────

function getBestRussianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null
  const voices = window.speechSynthesis.getVoices()
  const priorities = ["Milena", "Irina", "Alena", "Anna", "ru-RU", "ru"]
  for (const p of priorities) {
    const v = voices.find((v) => v.lang.startsWith("ru") && (v.name.includes(p) || v.lang === p))
    if (v) return v
  }
  return voices.find((v) => v.lang.startsWith("ru")) ?? null
}

async function speakText(
  text: string,
  onEnd?: () => void,
  audioRef?: React.MutableRefObject<HTMLAudioElement | null>,
) {
  if (!text) { onEnd?.(); return }

  try {
    const res = await fetch("/api/modules/hr/nancy/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (res.ok && res.status !== 204) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      if (audioRef) audioRef.current = audio
      const cleanup = () => { URL.revokeObjectURL(url); if (audioRef) audioRef.current = null; onEnd?.() }
      audio.onended = cleanup
      audio.onerror = cleanup
      await audio.play()
      return
    }
  } catch { /* fall through */ }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel()
    // Убираем markdown-разметку для TTS
    const clean = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^#+\s+/gm, "")
      .replace(/`([^`]+)`/g, "$1")
    const utt = new SpeechSynthesisUtterance(clean)
    utt.lang  = "ru-RU"
    utt.rate  = 1.05
    utt.pitch = 1.1
    if (window.speechSynthesis.getVoices().length === 0) {
      await new Promise<void>((r) => {
        window.speechSynthesis.onvoiceschanged = () => r()
        setTimeout(r, 1000)
      })
    }
    const voice = getBestRussianVoice()
    if (voice) utt.voice = voice
    utt.onend  = () => onEnd?.()
    utt.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utt)
    return
  }

  onEnd?.()
}

// ─── Компонент ──────────────────────────────────────────────────────────────

export function NancyAssistant() {
  const pathname = usePathname()
  const mod      = detectModule(pathname)

  const [open,     setOpen]     = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState("")
  const [listening,    setListening]    = useState(false)
  const [thinking,     setThinking]     = useState(false)
  const [speaking,     setSpeaking]     = useState(false)
  const [micSupported, setMicSupported] = useState(false)
  const [savingId,     setSavingId]     = useState<string | null>(null)
  const [convMode,     setConvMode]     = useState(false)

  const listenHandleRef = useRef<ListenHandle | null>(null)
  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLInputElement>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const convModeRef     = useRef(false)
  const thinkingRef     = useRef(false)
  const sendMessageRef      = useRef<(text: string) => Promise<void>>(async () => {})
  const startListeningRef   = useRef<() => void>(() => {})

  // ── Поддержка микрофона (Web Audio API — работает в Safari/Chrome/Yandex) ──
  useEffect(() => {
    setMicSupported(micIsSupported())
  }, [])

  // ── Автоскролл ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── При смене модуля — обновить приветствие (если уже открыто) ──
  const prevModRef = useRef<ModuleCtx>(mod)
  useEffect(() => {
    if (prevModRef.current === mod) return
    prevModRef.current = mod
    setMessages((prev) =>
      prev.map((m) => m.id === "welcome" ? { ...m, text: WELCOME[mod] } : m),
    )
  }, [mod])

  // ── Открытие: добавить приветствие ──
  useEffect(() => {
    if (!open) return
    if (messages.length > 0) return
    const greeting = WELCOME[mod]
    setMessages([{ id: "welcome", role: "nancy", text: greeting }])
    setSpeaking(true)
    void speakText(greeting, () => setSpeaking(false))
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Сохранить ответ в базу знаний ──
  const saveToKnowledge = useCallback(async (msg: Message) => {
    if (savingId || msg.saved) return
    setSavingId(msg.id)
    try {
      // Заголовок — первая строка или первые 100 символов
      const title = (
        msg.text.match(/^#+\s+(.+)/m)?.[1] ||
        msg.text.match(/\*\*(.+?)\*\*/)?.[1] ||
        msg.text.split("\n").find((l) => l.trim().length > 5)?.trim() ||
        msg.text
      ).slice(0, 100)

      const res = await fetch("/api/modules/knowledge/articles", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title, content: msg.text, status: "draft", audience: ["employees"] }),
      })
      if (!res.ok) throw new Error("Ошибка сохранения")
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, saved: true } : m))
    } catch {
      alert("Не удалось сохранить. Попробуйте ещё раз.")
    }
    setSavingId(null)
  }, [savingId])

  // ── Обработка HR-действий ──
  const handleActions = useCallback((actions: NancyAction[]) => {
    for (const action of actions) {
      if (action.type === "fill_outbound") {
        window.dispatchEvent(new CustomEvent("nancy:fill-outbound", {
          detail: {
            textClauses: action.textClauses,
            area:         action.area,
            experience:   action.experience,
            softCriteria: action.softCriteria,
          },
        }))
      } else if (action.type === "search_outbound") {
        window.dispatchEvent(new CustomEvent("nancy:search-outbound"))
      } else if (action.type === "navigate" && action.href) {
        window.location.href = action.href
      }
    }
  }, [])

  // ── Синхронизация thinkingRef ──
  useEffect(() => { thinkingRef.current = thinking }, [thinking])

  // ── Остановить текущий синтез ──
  const stopCurrentSpeech = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel()
  }, [])

  // ── Распознать записанный фрагмент через Yandex STT ──
  const recognizePcm = useCallback(async (pcm: ArrayBuffer): Promise<string> => {
    try {
      const res = await fetch("/api/modules/hr/nancy/stt", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: pcm,
      })
      if (!res.ok) return ""
      const data = (await res.json()) as { text?: string }
      return (data.text ?? "").trim()
    } catch {
      return ""
    }
  }, [])

  // ── Начать слушать (запись PCM + Yandex STT — работает в Safari) ──
  const startListening = useCallback(() => {
    if (thinkingRef.current) return
    listenHandleRef.current?.abort()
    stopCurrentSpeech()
    listenHandleRef.current = listenOnce({
      onStart: () => setListening(true),
      onResult: async (pcm) => {
        setListening(false)
        const text = await recognizePcm(pcm)
        if (text) {
          // sendMessage сам перезапустит слушание после ответа (в режиме разговора)
          void sendMessageRef.current(text)
        } else if (convModeRef.current) {
          setTimeout(() => startListeningRef.current(), 300)
        }
      },
      onNoSpeech: () => {
        setListening(false)
        if (convModeRef.current) setTimeout(() => startListeningRef.current(), 300)
      },
      onError: () => setListening(false),
    })
  }, [stopCurrentSpeech, recognizePcm])

  // Держим ref актуальным
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // ── Отправка сообщения ──
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setInput("")
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: trimmed }])
    setThinking(true)

    try {
      // Для knowledge/learning/onboarding — ищем в базе знаний
      let knowledgeContext: string | undefined
      let citedMaterials: Message["cited"] = []

      if (needsKnowledgeSearch(mod)) {
        try {
          const searchRes = await fetch("/api/knowledge/ai-search", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ question: trimmed }),
          })
          if (searchRes.ok) {
            const sd = await searchRes.json() as {
              context?: string
              materialsList?: Array<{ id: string; name: string; type: "demo" | "article" }>
            }
            knowledgeContext = sd.context
            citedMaterials = (sd.materialsList ?? []).filter(
              (m) => m.name && sd.context?.toLowerCase().includes(m.name.toLowerCase()),
            ).slice(0, 3)
          }
        } catch { /* KB недоступна — продолжаем без контекста */ }
      }

      const vacancyIdMatch = pathname.match(/\/hr\/vacancies\/([^/]+)/)
      const res = await fetch("/api/modules/hr/nancy/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message: trimmed,
          context: {
            page:             pageLabel(pathname),
            vacancyId:        vacancyIdMatch?.[1],
            module:           mod,
            knowledgeContext,
          },
          history: messages.slice(-10).map((m) => ({ role: m.role, text: m.text })),
        }),
      })

      const data = (await res.json()) as { reply?: string; actions?: NancyAction[] }
      const reply = data.reply ?? "Что-то пошло не так. Попробуй ещё раз."

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "nancy", text: reply, cited: citedMaterials },
      ])

      if (data.actions?.length) handleActions(data.actions)

      setSpeaking(true)
      void speakText(reply, () => {
        setSpeaking(false)
        if (convModeRef.current && !thinkingRef.current) {
          setTimeout(() => startListening(), 600)
        }
      }, currentAudioRef)
    } catch {
      const errText = "Нет связи. Попробуй ещё раз."
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "nancy", text: errText }])
      void speakText(errText, () => {
        setSpeaking(false)
        if (convModeRef.current && !thinkingRef.current) setTimeout(() => startListening(), 600)
      }, currentAudioRef)
    } finally {
      setThinking(false)
    }
  }, [messages, pathname, mod, handleActions, startListening])

  // Держим sendMessageRef актуальным, чтобы startListening не зависел от него напрямую
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  // ── Сообщение об ошибке микрофона ──
  const micErrorText = (e: unknown): string => {
    const name = (e as { name?: string })?.name
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Доступ к микрофону запрещён. Разреши его для этого сайта: в Safari — «Настройки сайта» → Микрофон → Разрешить, затем обнови страницу."
    }
    if (name === "NotFoundError") return "Микрофон не найден. Проверь, что он подключён."
    return "Не удалось включить микрофон. Попробуй ещё раз или проверь разрешения браузера."
  }
  const showMicError = useCallback((e: unknown) => {
    console.error("[nancy] mic error:", (e as { name?: string })?.name ?? e)
    setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "nancy", text: micErrorText(e) }])
  }, [])

  // ── Микрофон (одиночный) ──
  const toggleMic = useCallback(async () => {
    if (listening) {
      listenHandleRef.current?.abort()
      setListening(false)
      return
    }
    try {
      const ok = await ensureMic()
      if (!ok) { showMicError(new Error("no audio api")); return }
      startListening()
    } catch (e) {
      showMicError(e)
    }
  }, [listening, startListening, showMicError])

  // ── Режим разговора ──
  const toggleConvMode = useCallback(async () => {
    const next = !convModeRef.current
    if (next) {
      // ensureMic вызывается в обработчике клика → Safari разрешает микрофон
      try {
        const ok = await ensureMic()
        if (!ok) { showMicError(new Error("no audio api")); return }
      } catch (e) {
        showMicError(e)
        return
      }
      convModeRef.current = true
      setConvMode(true)
      if (!thinkingRef.current) startListening()
    } else {
      convModeRef.current = false
      setConvMode(false)
      listenHandleRef.current?.abort()
      setListening(false)
      stopCurrentSpeech()
      releaseMic()
    }
  }, [startListening, stopCurrentSpeech, showMicError])

  const statusText = listening ? "Слушаю..." : thinking ? "Думаю..." : speaking ? "Говорю..." : convMode ? "Режим разговора" : null

  // ── Кнопка-триггер ──
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 md:bottom-4 right-4 z-50",
          "h-16 w-16 rounded-full shadow-lg border-2 border-primary",
          "overflow-hidden hover:scale-105 active:scale-95 transition-transform",
          "flex items-center justify-center bg-violet-600 text-white",
        )}
        aria-label="Нэнси — AI-ассистент"
        title="Нэнси — AI-ассистент"
      >
        <Image
          src="/nancy-avatar.png"
          alt="Нэнси"
          width={64}
          height={64}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
        />
      </button>
    )
  }

  // ── Панель чата ──
  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col bg-background border shadow-2xl",
        "animate-in slide-in-from-bottom-4 duration-200",
        expanded
          ? "inset-4 rounded-2xl"
          : "bottom-[152px] md:bottom-20 right-4 w-80 sm:w-96 rounded-2xl overflow-hidden",
      )}
      style={expanded ? undefined : { maxHeight: "min(520px, calc(100vh - 96px))" }}
    >
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 bg-violet-600 text-white shrink-0 rounded-t-2xl">
        <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-white/30 shrink-0 bg-white/20">
          <Image
            src="/nancy-avatar.png"
            alt="Нэнси"
            width={36}
            height={36}
            className="w-full h-full object-cover"
            onError={(e) => { ;(e.target as HTMLImageElement).style.display = "none" }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">Нэнси</div>
          <div className="text-[11px] text-white/70 leading-tight">
            {statusText ?? "AI-ассистент"}
          </div>
        </div>
        {speaking && <Volume2 className="h-4 w-4 text-white/80 animate-pulse shrink-0" />}
        {micSupported && (
          <button
            onClick={toggleConvMode}
            className={cn(
              "transition-colors rounded-full p-0.5",
              convMode
                ? "text-white bg-white/25 ring-1 ring-white/50"
                : "text-white/70 hover:text-white",
            )}
            title={convMode ? "Выйти из режима разговора" : "Голосовой разговор"}
            aria-label={convMode ? "Выйти из режима разговора" : "Голосовой разговор"}
          >
            <PhoneCall className={cn("h-4 w-4", convMode && "animate-pulse")} />
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-white/70 hover:text-white transition-colors"
          aria-label={expanded ? "Свернуть" : "На весь экран"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          onClick={() => {
            setOpen(false); setExpanded(false)
            convModeRef.current = false; setConvMode(false)
            listenHandleRef.current?.abort()
            setListening(false)
            stopCurrentSpeech()
            releaseMic()
          }}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex flex-col",
              m.role === "nancy" ? "items-start" : "items-end",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                m.role === "nancy"
                  ? "bg-muted text-foreground rounded-tl-sm"
                  : "bg-violet-600 text-white rounded-tr-sm",
              )}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>

              {/* Источники из базы знаний */}
              {m.cited && m.cited.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                  <p className="text-xs text-muted-foreground">📎 Источники:</p>
                  {m.cited.map((c) => (
                    <a
                      key={`${c.type}-${c.id}`}
                      href={c.type === "demo" ? `/hr/library/preview/${c.id}` : `/knowledge-v2/create/article?id=${c.id}`}
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

            {/* Сохранить в базу знаний */}
            {m.role === "nancy" && m.id !== "welcome" && !m.id.startsWith("err-") && (
              <button
                type="button"
                onClick={() => void saveToKnowledge(m)}
                disabled={!!savingId || m.saved}
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-colors",
                  m.saved
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground hover:text-foreground",
                  !!savingId && savingId !== m.id && "opacity-40 pointer-events-none",
                )}
              >
                {savingId === m.id
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Сохраняю...</>
                  : m.saved
                    ? <><Check className="w-3 h-3" /> Сохранено</>
                    : <><BookmarkPlus className="w-3 h-3" /> В базу знаний</>}
              </button>
            )}
          </div>
        ))}

        {thinking && (
          <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 mr-auto inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Думаю...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t bg-muted/30 shrink-0">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input) }
          }}
          placeholder="Напиши или нажми микрофон..."
          className="h-8 text-sm bg-background flex-1"
          disabled={thinking || listening}
        />
        {input.trim() ? (
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 bg-violet-600 hover:bg-violet-700"
            onClick={() => void sendMessage(input)}
            disabled={thinking}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        ) : micSupported ? (
          <Button
            size="icon"
            variant={listening ? "destructive" : "outline"}
            className={cn("h-8 w-8 shrink-0", listening && "animate-pulse")}
            onClick={toggleMic}
            disabled={thinking}
            title={listening ? "Остановить запись" : "Говорить с Нэнси"}
          >
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
