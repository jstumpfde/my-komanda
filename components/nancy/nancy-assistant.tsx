"use client"

// components/nancy/nancy-assistant.tsx
//
// Глобальный голосовой ассистент «Нэнси» — плавающая кнопка + диалог.
//
// TTS: если YANDEX_API_KEY задан на сервере → /api/modules/hr/nancy/tts
//      возвращает audio/mpeg (голос Алёна); иначе 204 → браузерный
//      SpeechSynthesis (лучший русский голос из доступных).
//
// STT: browser Web Speech API (SpeechRecognition). Chrome/Edge/Safari.
//
// Структурированные действия приходят от AI в поле `actions`:
//   fill_outbound   — window.dispatchEvent('nancy:fill-outbound', data)
//   search_outbound — window.dispatchEvent('nancy:search-outbound')
//   navigate        — router.push(href)
//
// Чтобы страница реагировала — слушай эти события (см. outbound-sourcing-tab.tsx).

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Mic, MicOff, X, Send, Loader2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "nancy"
  text: string
}

interface NancyAction {
  type: "fill_outbound" | "search_outbound" | "navigate"
  textClauses?: Array<{ text: string; field: string }>
  area?: string
  experience?: string
  softCriteria?: string
  href?: string
}

// Лучший доступный русский голос в браузере (fallback когда нет Yandex ключа).
function getBestRussianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null
  const voices = window.speechSynthesis.getVoices()
  // Приоритет: нейросетевые → онлайн → любой русский
  const priorities = ["Milena", "Irina", "Yuri", "ru-RU", "ru_RU", "ru"]
  for (const p of priorities) {
    const v = voices.find(
      (v) => v.lang.startsWith("ru") && (v.name.includes(p) || v.lang === p),
    )
    if (v) return v
  }
  return voices.find((v) => v.lang.startsWith("ru")) ?? null
}

// Воспроизводим текст: сначала пробуем Yandex TTS, при 204 — браузер.
async function speakText(text: string, onEnd?: () => void) {
  if (!text) { onEnd?.(); return }

  try {
    const res = await fetch("/api/modules/hr/nancy/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })

    if (res.ok && res.status !== 204) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); onEnd?.() }
      audio.onerror = () => { URL.revokeObjectURL(url); onEnd?.() }
      await audio.play()
      return
    }
  } catch { /* fall through to browser TTS */ }

  // Браузерный fallback
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = "ru-RU"
    utt.rate = 1.05
    utt.pitch = 1.1
    // Ждём загрузки голосов если список пустой
    if (window.speechSynthesis.getVoices().length === 0) {
      await new Promise<void>((r) => {
        window.speechSynthesis.onvoiceschanged = () => r()
        setTimeout(r, 1000) // timeout чтобы не висеть
      })
    }
    const voice = getBestRussianVoice()
    if (voice) utt.voice = voice
    utt.onend = () => onEnd?.()
    utt.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utt)
    return
  }

  onEnd?.()
}

// Определяем контекст по pathname
function pageContext(pathname: string): string {
  if (pathname.includes("/hr/vacancies/")) {
    const id = pathname.match(/\/hr\/vacancies\/([^/]+)/)?.[1]
    return `Страница вакансии${id ? ` (id: ${id})` : ""}`
  }
  if (pathname.startsWith("/hr/vacancies")) return "Список вакансий"
  if (pathname.startsWith("/hr/calendar")) return "Календарь"
  if (pathname.startsWith("/hr/candidates")) return "Кандидаты"
  if (pathname.startsWith("/hr/interviews")) return "Интервью"
  if (pathname.startsWith("/team")) return "Команда"
  if (pathname.startsWith("/settings")) return "Настройки"
  return pathname
}

export function NancyAssistant() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [micSupported, setMicSupported] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Проверяем поддержку микрофона
  useEffect(() => {
    setMicSupported(
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    )
  }, [])

  // Авто-скролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // При открытии — приветствие
  useEffect(() => {
    if (!open) return
    if (messages.length > 0) return
    const greeting = "Привет! Я Нэнси. Чем помочь?"
    setMessages([{ role: "nancy", text: greeting }])
    setSpeaking(true)
    void speakText(greeting, () => setSpeaking(false))
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Обработка действий от AI
  const handleActions = useCallback(
    (actions: NancyAction[]) => {
      for (const action of actions) {
        if (action.type === "fill_outbound") {
          window.dispatchEvent(
            new CustomEvent("nancy:fill-outbound", {
              detail: {
                textClauses: action.textClauses,
                area:         action.area,
                experience:   action.experience,
                softCriteria: action.softCriteria,
              },
            }),
          )
        } else if (action.type === "search_outbound") {
          window.dispatchEvent(new CustomEvent("nancy:search-outbound"))
        } else if (action.type === "navigate" && action.href) {
          window.location.href = action.href
        }
      }
    },
    [],
  )

  // Отправка сообщения (текст или голос)
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      setInput("")
      setMessages((prev) => [...prev, { role: "user", text: trimmed }])
      setThinking(true)

      try {
        const vacancyIdMatch = pathname.match(/\/hr\/vacancies\/([^/]+)/)
        const res = await fetch("/api/modules/hr/nancy/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            context: {
              page:      pageContext(pathname),
              vacancyId: vacancyIdMatch?.[1],
            },
            history: messages.slice(-10).map((m) => ({ role: m.role, text: m.text })),
          }),
        })

        const data = (await res.json()) as { reply?: string; actions?: NancyAction[] }
        const reply = data.reply ?? "Что-то пошло не так. Попробуй ещё раз."

        setMessages((prev) => [...prev, { role: "nancy", text: reply }])
        if (data.actions?.length) handleActions(data.actions)

        setSpeaking(true)
        void speakText(reply, () => setSpeaking(false))
      } catch {
        const errText = "Нет связи. Попробуй ещё раз."
        setMessages((prev) => [...prev, { role: "nancy", text: errText }])
        void speakText(errText, () => setSpeaking(false))
      } finally {
        setThinking(false)
      }
    },
    [messages, pathname, handleActions],
  )

  // Запуск/остановка микрофона
  const toggleMic = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRec =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SpeechRec) return

    window.speechSynthesis?.cancel() // глушим TTS пока слушаем

    const rec = new SpeechRec()
    rec.lang = "ru-RU"
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onstart = () => setListening(true)
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ""
      if (transcript) void sendMessage(transcript)
    }

    recognitionRef.current = rec
    rec.start()
  }, [listening, sendMessage])

  const statusText = listening
    ? "Слушаю..."
    : thinking
      ? "Думаю..."
      : speaking
        ? "Говорю..."
        : null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "h-14 w-14 rounded-full shadow-lg",
          "bg-violet-600 hover:bg-violet-700 active:scale-95",
          "flex items-center justify-center transition-all",
          "text-white",
        )}
        aria-label="Нэнси — голосовой ассистент"
        title="Нэнси — голосовой ассистент"
      >
        {/* Иконка Нэнси: буква N */}
        <span className="text-lg font-bold tracking-tight select-none">N</span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "w-80 sm:w-96 rounded-2xl shadow-2xl border bg-background",
        "flex flex-col overflow-hidden",
      )}
      style={{ maxHeight: "min(520px, calc(100vh - 80px))" }}
    >
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 bg-violet-600 text-white shrink-0">
        <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
          N
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">Нэнси</div>
          <div className="text-[11px] text-white/70 leading-tight">
            {statusText ?? "Голосовой ассистент"}
          </div>
        </div>
        {speaking && <Volume2 className="h-4 w-4 text-white/80 animate-pulse" />}
        <button
          onClick={() => { setOpen(false); window.speechSynthesis?.cancel() }}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
              m.role === "nancy"
                ? "bg-muted text-foreground mr-auto rounded-tl-sm"
                : "bg-violet-600 text-white ml-auto rounded-tr-sm",
            )}
          >
            {m.text}
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
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input) } }}
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
