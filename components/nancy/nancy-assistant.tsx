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
//  - Конфиг: /api/modules/hr/nancy/config — enabled/name/greeting/visibleToRoles/modules

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import {
  Mic, MicOff, X, Send, Loader2, Volume2,
  Maximize2, Minimize2, BookmarkPlus, Check, PhoneCall, Trash2,
  ThumbsUp, ThumbsDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  ensureMic, releaseMic, listenOnce, micSupported as micIsSupported,
  stopSharedPlayback,
  type ListenHandle,
} from "@/lib/voice/record-pcm"

// Мобильное устройство — для iOS-аудио: на телефоне микрофон во время ответа
// освобождаем, иначе iOS играет TTS в ушной динамик (тихо) и рвёт сессию записи.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches)
}
import { useAuth } from "@/lib/auth"

// ─── Константы персистентности ──────────────────────────────────────────────

const HISTORY_MAX_MESSAGES = 50
const HISTORY_DEBOUNCE_MS  = 500

function historyKey(userId?: string, companyId?: string): string {
  return `nancy_chat_history_${userId ?? "anon"}_${companyId ?? "0"}`
}

function loadHistory(key: string): Message[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Message[]
    if (!Array.isArray(parsed)) return []
    // Берём последние N сообщений
    return parsed.slice(-HISTORY_MAX_MESSAGES)
  } catch {
    return []
  }
}

function saveHistory(key: string, messages: Message[]) {
  if (typeof window === "undefined") return
  try {
    const trimmed = messages.slice(-HISTORY_MAX_MESSAGES)
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch { /* quota exceeded — игнорируем */ }
}

// ─── Типы ──────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: "user" | "nancy"
  text: string
  cited?: Array<{ id: string; name: string; type: "demo" | "article" }>
  saved?: boolean
  feedback?: "up" | "down"
}

interface NancyAction {
  type:
    | "fill_outbound"
    | "search_outbound"
    | "navigate"
    | "create_vacancy"
    | "duplicate_vacancy"
    | "set_vacancy_salary"
    | "create_candidate"
    | "schedule_interview"
    | "show_candidates_above_threshold"
    | "export_candidates"
  // fill_outbound
  textClauses?: Array<{ text: string; field: string }>
  area?: string
  experience?: string
  softCriteria?: string
  // navigate
  href?: string
  // create_vacancy
  title?: string
  city?: string
  salary_min?: number
  salary_max?: number
  // duplicate_vacancy / set_vacancy_salary / show_candidates_above_threshold / export_candidates
  vacancyId?: string
  // create_candidate
  name?: string
  email?: string
  phone?: string
  // schedule_interview
  candidateId?: string
  startAt?: string
  endAt?: string
  interviewer?: string
  // show_candidates_above_threshold
  threshold?: number
}

interface NancyConfig {
  enabled: boolean
  name: string
  greeting: string
  visibleToRoles: string[]
  modules: string[]
  customInstructions: string
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
  knowledge:  "Привет! Я Алёна. Помогу найти материал в базе знаний или создать документ.",
  learning:   "Привет! Я Алёна. Помогу с курсами, тренировками и планами обучения.",
  hr:         "Привет! Я Алёна. Помогу с вакансиями, кандидатами и поиском резюме.",
  onboarding: "Привет! Я Алёна — твой AI-наставник. Спрашивай что угодно о компании.",
  sales:      "Привет! Я Алёна. Помогу с клиентами, сделками и воронкой продаж.",
  tasks:      "Привет! Я Алёна. Помогу с задачами и приоритизацией.",
  marketing:  "Привет! Я Алёна. Помогу с кампаниями и контентом.",
  logistics:  "Привет! Я Алёна. Помогу со складами и заказами.",
  platform:   "Привет! Я Алёна — AI-ассистент Company24. Чем помочь?",
}

// ─── Определяем pathname-контекст для API ──────────────────────────────────

function pageLabel(pathname: string): string {
  if (pathname.includes("/hr/vacancies/")) {
    const id = pathname.match(/\/hr\/vacancies\/([^/]+)/)?.[1]
    return `Страница вакансии${id ? ` (id: ${id})` : ""}`
  }
  if (pathname.startsWith("/hr/vacancies"))   return "Список вакансий"
  if (pathname.startsWith("/hr/candidates"))  return "Кандидаты"
  if (pathname.startsWith("/hr/interviews"))  return "Интервью и календарь"
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
  const ruVoices = voices.filter((v) => v.lang.startsWith("ru"))
  if (ruVoices.length === 0) return null

  // Предпочитаем нероботические голоса: Google, Microsoft Natural, Yuri, Milena
  const naturalKeywords = ["Google", "Natural", "Yuri", "Milena", "Irina", "Alena"]
  for (const kw of naturalKeywords) {
    const v = ruVoices.find((v) => v.name.includes(kw))
    if (v) return v
  }
  // Любой русский голос
  return ruVoices[0] ?? null
}

// Очищает текст ответа ассистента для синтеза речи:
// убирает теги <action>...</action>, markdown и прочие служебные символы.
function cleanForTts(text: string): string {
  return text
    // Убираем action-теги целиком (они не произносятся)
    .replace(/<action>[\s\S]*?<\/action>/gi, "")
    // Убираем markdown-разметку
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    // Убираем любые оставшиеся HTML/XML-теги
    .replace(/<[^>]+>/g, "")
    .trim()
}

// Тихий 1-байтный mp3-файл в base64 — для разблокировки autoplay.
// Стандартный минимальный валидный mp3-фрейм (silence).
const SILENT_MP3_DATA_URI =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU2LjM2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6v////////////////////////////////8AAAAATGF2YzU2LjQxAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFN//MUZAMAAAGkAAAAAAAAA0gAAAAARTMu//MUZAYAAAGkAAAAAAAAA0gAAAAAOTku//MUZAkAAAGkAAAAAAAAA0gAAAAANVVV"

async function speakText(
  text: string,
  onEnd?: () => void,
  audioRef?: React.MutableRefObject<HTMLAudioElement | null>,
  unlockedAudioRef?: React.MutableRefObject<HTMLAudioElement | null>,
) {
  if (!text) { onEnd?.(); return }

  // Очищаем текст от тегов и markdown перед отправкой в TTS
  const ttsText = cleanForTts(text)
  if (!ttsText) { onEnd?.(); return }

  let blobUrl: string | null = null
  try {
    const res = await fetch("/api/modules/hr/nancy/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ttsText }),
    })
    if (res.ok && res.status !== 204) {
      const data = await res.arrayBuffer()
      // Всегда через HTMLAudio (media-маршрут → ОСНОВНОЙ динамик, громко).
      // На мобиле микрофон освобождается ДО вызова (см. speakAndContinue в
      // компоненте), чтобы iOS не уводил звук в ушной динамик и не рвал сессию.
      const blob = new Blob([data], { type: "audio/mpeg" })
      blobUrl = URL.createObjectURL(blob)

      // Используем разблокированный элемент если он передан и разблокирован,
      // иначе fallback на new Audio() (старое поведение для случая без жеста).
      const el = unlockedAudioRef?.current ?? new Audio()
      if (audioRef) audioRef.current = el

      const cleanup = () => {
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
        if (audioRef) audioRef.current = null
        onEnd?.()
      }

      el.onended = cleanup
      el.onerror = cleanup
      el.src = blobUrl
      el.muted = false

      try {
        await el.play()
        return
      } catch (playErr) {
        // play() отклонён даже после unlock — логируем, но НЕ падаем на читалку
        console.warn("[nancy/tts] audio.play() rejected after unlock attempt:", playErr)
        cleanup()
        return
      }
    }
    // Сервер вернул 204 (TTS отключён / нет ключа) → fallback на браузерный синтез
  } catch {
    // Сетевая ошибка → fallback на браузерный синтез
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
  }

  // Fallback: браузерный speechSynthesis (только при 204 или сетевой ошибке)
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel()
    // ttsText уже очищен выше (cleanForTts), используем его напрямую
    const utt = new SpeechSynthesisUtterance(ttsText)
    utt.lang  = "ru-RU"
    utt.rate  = 0.97
    utt.pitch = 1.0
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
  const { role, user } = useAuth()

  // ── Ключ localStorage для истории этого пользователя ──
  const storageKey = historyKey(user.id || undefined, user.companyId ?? undefined)

  // ── Конфиг ассистента (загружается при монтировании) ──
  const [config, setConfig] = useState<NancyConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/nancy/config")
      .then(r => r.ok ? r.json() : null)
      .then((data: NancyConfig | null) => {
        setConfig(data)
      })
      .catch(() => setConfig(null))
      .finally(() => setConfigLoaded(true))
  }, [])

  const [open,     setOpen]     = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState("")
  // Флаг: история уже восстановлена из localStorage
  const historyRestoredRef = useRef(false)
  // Debounce-таймер для записи истории
  const saveDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // ── Единый разблокированный HTMLAudioElement для обхода autoplay-политики ──
  // Браузер блокирует audio.play() если с момента пользовательского жеста
  // прошло слишком много времени (transient activation истекла). Чтобы играть
  // Яндекс-аудио на отложенных/длинных ответах, держим ОДИН элемент, который
  // «разблокируется» тихим play/pause при первом жесте пользователя.
  const unlockedAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioUnlockedRef = useRef(false)

  // Инициализируем элемент один раз на клиенте
  useEffect(() => {
    if (typeof window === "undefined") return
    const el = new Audio()
    el.preload = "none"
    unlockedAudioRef.current = el
  }, [])

  // Идемпотентный unlock: вызывать в каждом обработчике пользовательского жеста.
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return
    const el = unlockedAudioRef.current
    if (!el) return
    el.src = SILENT_MP3_DATA_URI
    el.muted = true
    el.play().then(() => { el.pause(); el.muted = false; audioUnlockedRef.current = true }).catch(() => {})
  }, [])

  // ── Поддержка микрофона (Web Audio API — работает в Safari/Chrome/Yandex) ──
  useEffect(() => {
    setMicSupported(micIsSupported())
  }, [])

  // ── Восстановление истории из localStorage при монтировании ──
  useEffect(() => {
    if (historyRestoredRef.current) return
    historyRestoredRef.current = true
    const saved = loadHistory(storageKey)
    if (saved.length > 0) {
      setMessages(saved)
    }
  }, [storageKey])

  // ── Сохранение истории в localStorage (debounce) ──
  useEffect(() => {
    // Не сохраняем пустую историю или историю только из приветствия
    if (messages.length === 0) return
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      saveHistory(storageKey, messages)
    }, HISTORY_DEBOUNCE_MS)
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  }, [messages, storageKey])

  // ── Автоскролл ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── При смене модуля — обновить только сообщение приветствия, не стирать историю ──
  const prevModRef = useRef<ModuleCtx>(mod)
  useEffect(() => {
    if (prevModRef.current === mod) return
    prevModRef.current = mod
    const welcomeText = config?.greeting?.trim() || WELCOME[mod]
    setMessages((prev) =>
      prev.map((m) => m.id === "welcome" ? { ...m, text: welcomeText } : m),
    )
  }, [mod, config])

  // ── Открытие: добавить приветствие только если нет истории ──
  useEffect(() => {
    if (!open) return
    // Если уже есть сообщения (восстановлены из localStorage) — не добавляем приветствие
    if (messages.length > 0) {
      setTimeout(() => inputRef.current?.focus(), 100)
      return
    }
    const greeting = config?.greeting?.trim() || WELCOME[mod]
    setMessages([{ id: "welcome", role: "nancy", text: greeting }])
    setSpeaking(true)
    void speakText(greeting, () => setSpeaking(false), undefined, unlockedAudioRef)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Очистить историю диалога ──
  const clearHistory = useCallback(() => {
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    }
    const greeting = config?.greeting?.trim() || WELCOME[mod]
    setMessages([{ id: "welcome", role: "nancy", text: greeting }])
  }, [storageKey, config, mod])

  // ── Фидбек 👍/👎 ──
  const sendFeedback = useCallback(async (msg: Message, rating: "up" | "down") => {
    // Оптимистично обновляем UI
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, feedback: rating } : m))
    // Отправляем в фоне, не ждём, молча игнорируем ошибки
    try {
      await fetch("/api/modules/hr/nancy/feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messageId: msg.id,
          rating,
          question: (() => {
            // Ищем предыдущее user-сообщение
            const msgs = messages
            const idx = msgs.findIndex((m) => m.id === msg.id)
            for (let i = idx - 1; i >= 0; i--) {
              if (msgs[i].role === "user") return msgs[i].text
            }
            return ""
          })(),
          answer: msg.text,
          module: mod,
          page:   pageLabel(pathname),
        }),
      })
    } catch { /* игнорируем */ }
  }, [messages, mod, pathname])

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

  // ── Вспомогательная функция: добавить сообщение Нэнси в чат ──
  const addNancyMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: `a-${Date.now()}-${Math.random()}`, role: "nancy", text }])
  }, [])

  // ── Обработка HR-действий ──
  const handleActions = useCallback((actions: NancyAction[]) => {
    for (const action of actions) {

      // ── Существующие действия ──
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

      // ── Скилл 1: создать вакансию ──
      } else if (action.type === "create_vacancy") {
        if (!action.title) {
          addNancyMessage("Не указано название вакансии. Скажи, как она называется?")
          continue
        }
        const body: Record<string, unknown> = { title: action.title }
        if (action.city)       body.city       = action.city
        if (action.salary_min) body.salary_min  = action.salary_min
        if (action.salary_max) body.salary_max  = action.salary_max

        void (async () => {
          try {
            const res = await fetch("/api/modules/hr/vacancies", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: string }
              addNancyMessage(`Не удалось создать вакансию: ${err.error ?? res.statusText}`)
              return
            }
            const vac = (await res.json()) as { data?: { id?: string; title?: string } }
            const id = vac.data?.id
            const title = vac.data?.title ?? action.title
            if (id) {
              addNancyMessage(`Вакансия «${title}» создана. Открыть для редактирования?`)
              // Сразу переходим на страницу вакансии
              window.location.href = `/hr/vacancies/${id}`
            } else {
              addNancyMessage(`Вакансия «${title}» создана.`)
            }
          } catch {
            addNancyMessage("Ошибка при создании вакансии. Попробуй ещё раз.")
          }
        })()

      // ── Скилл 2: дублировать вакансию ──
      } else if (action.type === "duplicate_vacancy") {
        const vid = action.vacancyId
        if (!vid) {
          addNancyMessage("Открой страницу вакансии, которую нужно дублировать, — тогда смогу её скопировать.")
          continue
        }
        void (async () => {
          try {
            const res = await fetch(`/api/modules/hr/vacancies/${vid}/duplicate`, {
              method: "POST",
            })
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: string }
              addNancyMessage(`Не удалось дублировать вакансию: ${err.error ?? res.statusText}`)
              return
            }
            const dup = (await res.json()) as { data?: { id?: string; title?: string } }
            const dupId = dup.data?.id
            const dupTitle = dup.data?.title
            if (dupId) {
              addNancyMessage(`Готово! Создана копия «${dupTitle ?? "вакансии"}». Открываю её.`)
              window.location.href = `/hr/vacancies/${dupId}`
            } else {
              addNancyMessage(`Вакансия скопирована.`)
            }
          } catch {
            addNancyMessage("Ошибка при дублировании вакансии. Попробуй ещё раз.")
          }
        })()

      // ── Скилл 3: установить зарплату вакансии ──
      } else if (action.type === "set_vacancy_salary") {
        const vid = action.vacancyId
        if (!vid) {
          addNancyMessage("Открой страницу вакансии — тогда смогу обновить зарплату.")
          continue
        }
        if (!action.salary_min && !action.salary_max) {
          addNancyMessage("Укажи размер зарплаты (например, «80-120к» или «от 100к»).")
          continue
        }
        const patch: Record<string, unknown> = {}
        if (action.salary_min) patch.salary_min = action.salary_min
        if (action.salary_max) patch.salary_max = action.salary_max

        void (async () => {
          try {
            const res = await fetch(`/api/modules/hr/vacancies/${vid}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            })
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: string }
              addNancyMessage(`Не удалось обновить зарплату: ${err.error ?? res.statusText}`)
              return
            }
            const minStr = action.salary_min ? `${(action.salary_min / 1000).toFixed(0)}к` : null
            const maxStr = action.salary_max ? `${(action.salary_max / 1000).toFixed(0)}к` : null
            const range = minStr && maxStr ? `${minStr}–${maxStr}` : minStr ?? maxStr
            addNancyMessage(`Зарплата обновлена: ${range} ₽.`)
          } catch {
            addNancyMessage("Ошибка при обновлении зарплаты. Попробуй ещё раз.")
          }
        })()

      // ── Скилл 4: добавить кандидата вручную ──
      } else if (action.type === "create_candidate") {
        if (!action.vacancyId || !action.name) {
          if (!action.name) {
            addNancyMessage("Укажи имя кандидата.")
          } else {
            addNancyMessage("Укажи, на какую вакансию добавить кандидата.")
          }
          continue
        }
        const body: Record<string, unknown> = {
          vacancyId: action.vacancyId,
          name: action.name,
          source: "manual",
        }
        if (action.email) body.email = action.email
        if (action.phone) body.phone = action.phone

        void (async () => {
          try {
            const res = await fetch("/api/modules/hr/candidates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: string }
              addNancyMessage(`Не удалось добавить кандидата: ${err.error ?? res.statusText}`)
              return
            }
            addNancyMessage(`Кандидат «${action.name}» добавлен в вакансию.`)
          } catch {
            addNancyMessage("Ошибка при добавлении кандидата. Попробуй ещё раз.")
          }
        })()

      // ── Скилл 5: запланировать интервью ──
      } else if (action.type === "schedule_interview") {
        if (!action.startAt || !action.endAt) {
          addNancyMessage("Укажи дату и время интервью (например, «15 июня в 14:00, продолжительность 1 час»).")
          continue
        }
        const body: Record<string, unknown> = {
          title: action.title ?? "Интервью",
          type: "interview",
          startAt: action.startAt,
          endAt: action.endAt,
          scope: "hr",
        }
        if (action.candidateId) body.candidateId = action.candidateId
        if (action.vacancyId)   body.vacancyId   = action.vacancyId
        if (action.interviewer) body.interviewer  = action.interviewer

        void (async () => {
          try {
            const res = await fetch("/api/modules/hr/calendar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: string }
              addNancyMessage(`Не удалось запланировать интервью: ${err.error ?? res.statusText}`)
              return
            }
            const start = new Date(action.startAt!).toLocaleString("ru-RU", {
              day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
            })
            addNancyMessage(`Интервью запланировано на ${start}. Можешь посмотреть в календаре.`)
          } catch {
            addNancyMessage("Ошибка при создании интервью. Попробуй ещё раз.")
          }
        })()

      // ── Скилл 6: показать кандидатов со скором выше N ──
      } else if (action.type === "show_candidates_above_threshold") {
        const vid = action.vacancyId
        const threshold = action.threshold ?? 70
        if (!vid) {
          addNancyMessage("Открой страницу вакансии — тогда отфильтрую кандидатов по скору.")
          continue
        }
        const href = `/hr/vacancies/${vid}?scoreMin=${threshold}`
        addNancyMessage(`Показываю кандидатов со скором ≥ ${threshold}. Перехожу к списку.`)
        window.location.href = href

      // ── Скилл 7: экспортировать кандидатов в Excel ──
      } else if (action.type === "export_candidates") {
        const vid = action.vacancyId
        if (!vid) {
          addNancyMessage("Открой страницу вакансии — тогда смогу экспортировать кандидатов.")
          continue
        }
        addNancyMessage("Готовлю файл Excel с кандидатами…")
        // Открываем скачивание в новой вкладке (GET = скачать все поля)
        window.open(`/api/modules/hr/vacancies/${vid}/export-candidates`, "_blank")
      }
    }
  }, [addNancyMessage])

  // ── Синхронизация thinkingRef ──
  useEffect(() => { thinkingRef.current = thinking }, [thinking])

  // ── Остановить текущий синтез ──
  const stopCurrentSpeech = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    stopSharedPlayback()
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

    // Unlock audio на жесте отправки (идемпотентно)
    unlockAudio()
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
      const mobile = isMobileDevice()
      // На мобиле в режиме разговора освобождаем микрофон перед ответом:
      // iOS тогда играет TTS в основной динамик (громко), а не в ушной, и не
      // рвёт сессию. startListening() ниже заново откроет микрофон (через
      // listenOnce→ensureMic); если iOS попросит жест — пользователь тапнет 📞.
      if (mobile && convModeRef.current) releaseMic()
      void speakText(reply, () => {
        setSpeaking(false)
        if (convModeRef.current && !thinkingRef.current) {
          setTimeout(() => startListening(), mobile ? 350 : 600)
        }
      }, currentAudioRef, unlockedAudioRef)
    } catch {
      const errText = "Нет связи. Попробуй ещё раз."
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "nancy", text: errText }])
      const mobile = isMobileDevice()
      if (mobile && convModeRef.current) releaseMic()
      void speakText(errText, () => {
        setSpeaking(false)
        if (convModeRef.current && !thinkingRef.current) setTimeout(() => startListening(), mobile ? 350 : 600)
      }, currentAudioRef, unlockedAudioRef)
    } finally {
      setThinking(false)
    }
  }, [messages, pathname, mod, handleActions, startListening, unlockAudio, unlockedAudioRef])

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
    // Unlock audio на жесте нажатия микрофона (идемпотентно)
    unlockAudio()
    try {
      const ok = await ensureMic()
      if (!ok) { showMicError(new Error("no audio api")); return }
      startListening()
    } catch (e) {
      showMicError(e)
    }
  }, [listening, startListening, showMicError, unlockAudio])

  // ── Режим разговора ──
  const toggleConvMode = useCallback(async () => {
    const next = !convModeRef.current
    if (next) {
      // Unlock audio на жесте включения режима разговора (идемпотентно)
      unlockAudio()
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
  }, [startListening, stopCurrentSpeech, showMicError, unlockAudio])

  // ── Проверка видимости по конфигу ──
  // Ждём загрузки конфига (configLoaded), затем применяем правила.
  // Если конфиг недоступен (ошибка сети) — показываем ассистента по умолчанию.
  if (!configLoaded) return null

  if (config) {
    // enabled === false → скрыть полностью
    if (config.enabled === false) return null

    // Проверяем модуль (если задан непустой список)
    if (config.modules.length > 0 && !config.modules.includes(mod)) return null

    // Проверяем роль (если задан непустой список)
    if (config.visibleToRoles.length > 0 && role && !config.visibleToRoles.includes(role)) return null
  }

  // Имя ассистента: кастомное или дефолт «Алёна»
  const assistantName = config?.name?.trim() || "Алёна"

  const statusText = listening ? "Слушаю..." : thinking ? "Думаю..." : speaking ? "Говорю..." : convMode ? "Режим разговора" : null

  // ── Кнопка-триггер ──
  if (!open) {
    return (
      <button
        onClick={() => { unlockAudio(); setOpen(true) }}
        className={cn(
          "fixed bottom-20 md:bottom-4 right-4 z-50",
          "h-16 w-16 rounded-full shadow-lg border-2 border-primary",
          "overflow-hidden hover:scale-105 active:scale-95 transition-transform",
          "flex items-center justify-center bg-violet-600 text-white",
        )}
        aria-label={`${assistantName} — AI-ассистент`}
        title={`${assistantName} — AI-ассистент`}
      >
        <Image
          src="/nancy-avatar.png"
          alt={assistantName}
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
            alt={assistantName}
            width={36}
            height={36}
            className="w-full h-full object-cover"
            onError={(e) => { ;(e.target as HTMLImageElement).style.display = "none" }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">{assistantName}</div>
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
          onClick={clearHistory}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Очистить диалог"
          title="Очистить диалог"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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

            {/* Сохранить в базу знаний + фидбек */}
            {m.role === "nancy" && m.id !== "welcome" && !m.id.startsWith("err-") && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => void saveToKnowledge(m)}
                  disabled={!!savingId || m.saved}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-colors",
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
                {/* Разделитель */}
                <span className="text-muted-foreground/40 text-xs">·</span>
                {/* 👍 */}
                <button
                  type="button"
                  onClick={() => void sendFeedback(m, "up")}
                  title="Полезно"
                  aria-label="Полезно"
                  className={cn(
                    "inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                    m.feedback === "up"
                      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
                      : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
                  )}
                >
                  <ThumbsUp className="w-3 h-3" />
                </button>
                {/* 👎 */}
                <button
                  type="button"
                  onClick={() => void sendFeedback(m, "down")}
                  title="Не помогло"
                  aria-label="Не помогло"
                  className={cn(
                    "inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                    m.feedback === "down"
                      ? "text-rose-600 bg-rose-50 dark:bg-rose-900/30"
                      : "text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20",
                  )}
                >
                  <ThumbsDown className="w-3 h-3" />
                </button>
              </div>
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
            title={listening ? "Остановить запись" : `Говорить с ${assistantName}`}
          >
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
