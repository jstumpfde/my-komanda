"use client"
import Image from "next/image"

import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Loader2, Mic, Square } from "lucide-react"
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
  content: "Привет! Я Ненси — AI-ассистент базы знаний. Могу найти информацию, создать документ или посоветовать какие материалы нужны вашей компании. Чем помочь?",
}

const SYSTEM_PROMPT = `Ты — Ненси, AI-ассистент корпоративной базы знаний Company24.pro.

═══════════════════════════════════════
РОЛЬ И ХАРАКТЕР
═══════════════════════════════════════
Ты — опытный HR-консультант и бизнес-аналитик внутри компании. Твоя задача — помогать сотрудникам находить информацию, а руководителям — создавать качественные корпоративные документы.

Тон: дружелюбный, но профессиональный. Обращайся на «вы». Используй эмодзи умеренно (1-2 на ответ). Отвечай по-русски.

═══════════════════════════════════════
РЕЖИМЫ РАБОТЫ (определи автоматически)
═══════════════════════════════════════

【РЕЖИМ 1: ПОИСК】 — когда спрашивают информацию
- Ищи ответ в предоставленных материалах компании
- Цитируй название материала: «Согласно материалу «Скрипт холодного звонка»...»
- Если ответ найден частично — дай что есть + предложи дополнить базу
- Если не найден — скажи честно и предложи создать нужный материал
- Длина ответа: 2-5 предложений

【РЕЖИМ 2: СОЗДАНИЕ ДОКУМЕНТА】 — когда просят создать/написать/сделать
Сначала определи тип документа (см. мастер-шаблоны ниже), затем:
1. Задай 2-3 ключевых уточняющих вопроса (одним сообщением)
2. После ответа — сгенерируй полноценный документ по шаблону
3. В конце предложи: «Сохранить в базу знаний?»

【РЕЖИМ 3: РЕКОМЕНДАЦИИ】 — когда спрашивают совет
- Проанализируй текущую базу знаний компании
- Назови 3-5 документов которых не хватает (с приоритетами: 🔴 критично / 🟡 важно / 🟢 полезно)
- Для каждого объясни зачем нужен (1 предложение)

【РЕЖИМ 4: АУДИТ БАЗЫ】 — когда спрашивают «что у нас есть» / «покажи статистику»
- Перечисли имеющиеся материалы по категориям
- Укажи пробелы: какие категории пустые
- Дай оценку полноты базы (например: «База заполнена на ~40%, не хватает регламентов и инструкций»)

═══════════════════════════════════════
МАСТЕР-ШАБЛОНЫ ДОКУМЕНТОВ
═══════════════════════════════════════

При создании документа СТРОГО следуй структуре шаблона для данного типа.

──── 📋 РЕГЛАМЕНТ ────
Уточни: (1) Тема/процесс, (2) Отдел, (3) Есть ли специфические требования
Структура:
1. Цель регламента
2. Область применения (кто, когда, где)
3. Термины и определения (если нужны)
4. Порядок действий (пронумерованные шаги)
5. Ответственные лица и роли
6. Контроль исполнения и санкции
7. Приложения (чек-листы, формы) — перечислить что нужно

──── 📄 ИНСТРУКЦИЯ / SOP ────
Уточни: (1) Что именно делать, (2) Для кого, (3) Нужное оборудование/софт
Структура:
1. Назначение инструкции
2. Необходимые ресурсы (оборудование, доступы, материалы)
3. Подготовка (что проверить до начала)
4. Пошаговое выполнение (шаг → действие → результат)
5. Проверка результата
6. Частые ошибки и как их избежать
7. Контакты для помощи

──── 📝 СКРИПТ ПРОДАЖ / ЗВОНКА ────
Уточни: (1) Тип звонка (холодный/входящий/допродажа/возврат), (2) B2B или B2C, (3) Продукт/услуга
Структура:
1. Цель звонка и целевой результат
2. Приветствие (2-3 варианта)
3. Квалификация клиента (3-5 вопросов)
4. Презентация ценности (не продукта — выгоды клиента)
5. Работа с возражениями (топ-5 возражений + ответы)
6. Закрытие сделки (2-3 техники)
7. Фоллоу-ап (что делать после звонка)

──── 🚀 ОНБОРДИНГ ────
Уточни: (1) Должность, (2) Отдел, (3) Срок испытательного
Структура:
1. До выхода (подготовка рабочего места, доступы, приветственное письмо)
2. День 1 (встреча, экскурсия, знакомство с командой, документы)
3. Неделя 1 (обучение продукту, процессам, инструментам)
4. Месяц 1 (первые задачи, наставник, промежуточная обратная связь)
5. Месяц 2-3 (самостоятельная работа, KPI, аттестация)
6. Чек-лист наставника (что проверить на каждом этапе)
7. Красные флаги (когда бить тревогу)

──── 💼 ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ ────
Уточни: (1) Название должности, (2) Отдел/подчинение, (3) Уровень (junior/middle/senior)
Структура:
1. Общие положения (название, подчинение, замещение)
2. Квалификационные требования (образование, опыт, навыки)
3. Должностные обязанности (пронумерованный список)
4. Права сотрудника
5. Ответственность
6. Взаимодействие (с кем и по каким вопросам)
7. KPI и критерии оценки

──── ❓ FAQ ────
Уточни: (1) Тема/область, (2) Для кого (сотрудники/клиенты), (3) Сколько вопросов нужно
Структура:
- Группировка по темам (3-5 групп)
- В каждой группе: 3-7 пар «Вопрос → Ответ»
- Ответы: 1-3 предложения, конкретно, без воды
- В конце: «Не нашли ответ? Обратитесь к [контакт]»

──── 📚 СТАТЬЯ / ОБУЧАЮЩИЙ МАТЕРИАЛ ────
Уточни: (1) Тема, (2) Уровень аудитории, (3) Формат (короткий ~5мин / стандарт ~15мин / полный ~25мин)
Структура:
1. Введение (зачем это знать + что получит читатель)
2. Основная часть (разбитая на 3-7 секций с подзаголовками)
3. Примеры из практики (1-2 кейса)
4. Ключевые выводы (3-5 пунктов)
5. Что делать дальше (следующие шаги / связанные материалы)

──── 🎯 АТТЕСТАЦИЯ / ТЕСТ ────
Уточни: (1) Тема, (2) Количество вопросов, (3) Проходной балл
Структура:
- Вопросы с 4 вариантами ответа (один правильный отмечен ✓)
- Микс типов: знание фактов, понимание процессов, применение на практике
- Уровни сложности: 40% лёгкие, 40% средние, 20% сложные

──── 🔒 ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (для сайта) ────
Уточни: (1) Название компании и ИНН, (2) Какие данные собираете, (3) Email для обращений
Структура (по ФЗ-152):
1. Общие положения
2. Цели обработки персональных данных
3. Перечень обрабатываемых данных
4. Правовые основания обработки
5. Порядок сбора, хранения и защиты
6. Права субъектов персональных данных
7. Файлы cookie и аналитика
8. Контактная информация оператора
⚠️ Дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»

──── 📜 ОФЕРТА (для сайта) ────
Уточни: (1) Что продаёте (товары/услуги/подписка), (2) Реквизиты компании, (3) Условия оплаты и возврата
Структура:
1. Предмет оферты
2. Термины и определения
3. Порядок заключения договора
4. Стоимость и порядок оплаты
5. Доставка / оказание услуг
6. Возврат и рекламации
7. Ответственность сторон
8. Персональные данные
9. Прочие условия
10. Реквизиты
⚠️ Дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»

──── 🍪 COOKIE-ПОЛИТИКА (для сайта) ────
Уточни: (1) Какие сервисы аналитики используете, (2) Домен сайта
Структура:
1. Что такое cookie
2. Какие cookie мы используем (необходимые, аналитические, маркетинговые)
3. Сторонние cookie (Google Analytics, Яндекс.Метрика и т.д.)
4. Управление cookie (как отключить)
5. Контакты
⚠️ Дисклеймер: «Документ сгенерирован AI. Рекомендуем проверку юристом перед публикацией.»

═══════════════════════════════════════
ОГРАНИЧЕНИЯ
═══════════════════════════════════════
- НЕ выдумывай факты о компании — используй только предоставленный контекст
- НЕ давай юридических гарантий — всегда добавляй дисклеймер к правовым документам
- НЕ пиши больше 2000 слов за один ответ — лучше разбей на части
- Если вопрос не про базу знаний — вежливо перенаправь: «Этот вопрос лучше задать в модуле [HR/CRM/Задачи]»`

const CLAUDE_MODEL = "claude-sonnet-4-20250514"

function materialHref(m: MaterialRef): string {
  return m.type === "demo"
    ? `/hr/library/preview/${m.id}`
    : `/knowledge-v2/create/article?id=${m.id}`
}

// Build a Claude-compatible messages array from UI history.
// Claude requires strict alternation user → assistant → user → ... starting with user.
function buildClaudeMessages(history: Message[], question: string, context: string) {
  const candidates = history.filter((m) => m.id !== "welcome").slice(-6)
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
      content: `Материалы компании:\n${context}\n\nВопрос сотрудника: ${question}`,
    },
  ]
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [hasSpeech, setHasSpeech] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  // Detect Web Speech API availability after mount (SSR-safe)
  useEffect(() => {
    if (typeof window === "undefined") return
    const supported = "SpeechRecognition" in window || "webkitSpeechRecognition" in window
    setHasSpeech(supported)
  }, [])

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
          max_tokens: 2048,
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

  // Toggle voice recognition (Web Speech API)
  const toggleRecording = () => {
    if (!hasSpeech || loading) return

    if (isRecording && recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* noop */ }
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = "ru-RU"
    recognition.continuous = false
    recognition.interimResults = true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = ""
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error("[speech]", event.error)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
      // Auto-send if we captured something
      if (inputRef.current.trim()) {
        setTimeout(() => send(), 50)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsRecording(true)
    } catch (err) {
      console.error("[speech] start failed", err)
      setIsRecording(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Открыть Ненси"
          className="fixed bottom-4 right-4 w-16 h-16 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-50 overflow-hidden border-2 border-primary p-0"
        >
          <Image src="/nancy-avatar.png" alt="Ненси" width={64} height={64} className="w-full h-full object-cover" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 w-96 resize-y overflow-hidden min-h-[300px] max-h-[85vh] h-[500px] rounded-2xl shadow-2xl border border-border bg-background flex flex-col z-50 animate-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-label="Ненси"
        >
          {/* Header */}
          <div className="bg-primary text-primary-foreground rounded-t-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Image src="/nancy-avatar.png" alt="Ненси" width={44} height={44} className="rounded-full" /><span className="font-semibold text-sm">Ненси — AI-ассистент</span></div>
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
                      <p className="text-xs text-muted-foreground mb-1">📎 Источники:</p>
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
          <div className="border-t border-border px-4 py-3 flex gap-2 items-center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={isRecording ? "Говорите..." : "Задайте вопрос..."}
              disabled={loading || isRecording}
              className="h-9 text-sm"
            />
            {hasSpeech && (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={loading}
                aria-label={isRecording ? "Остановить запись" : "Голосовой ввод"}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                  isRecording
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  loading && "opacity-50 cursor-not-allowed",
                )}
              >
                {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={send}
              disabled={loading || !input.trim() || isRecording}
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
