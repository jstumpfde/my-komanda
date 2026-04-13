"use client"
import Image from "next/image"

import { useState, useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import { MessageCircle, X, Send, Loader2, Mic, Square, Maximize2, Minimize2, BookmarkPlus, Check, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth, ROLE_LABELS, type UserRole } from "@/lib/auth"

type Role = "user" | "assistant"

interface Message {
  id: string
  role: Role
  content: string
  cited?: MaterialRef[]
  saved?: boolean
}

interface MaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

// ─── Module-aware context ───────────────────────────────────────────────

type ModuleContext =
  | "knowledge"
  | "learning"
  | "hr"
  | "onboarding"
  | "sales"
  | "tasks"
  | "marketing"
  | "logistics"
  | "platform"

function detectModule(pathname: string): ModuleContext {
  if (pathname.startsWith("/knowledge-v2") || pathname.startsWith("/knowledge")) return "knowledge"
  if (pathname.startsWith("/learning")) return "learning"
  if (pathname.startsWith("/hr/adaptation") || pathname.startsWith("/hr/onboarding")) return "onboarding"
  if (pathname.startsWith("/hr")) return "hr"
  if (pathname.startsWith("/sales")) return "sales"
  if (pathname.startsWith("/tasks")) return "tasks"
  if (pathname.startsWith("/marketing")) return "marketing"
  if (pathname.startsWith("/logistics")) return "logistics"
  return "platform"
}

const WELCOME_MESSAGES: Record<ModuleContext, string> = {
  knowledge:
    "Привет! Я Ненси — AI-ассистент базы знаний. Могу найти информацию, создать документ или посоветовать какие материалы нужны вашей компании. Чем помочь?",
  learning:
    "Привет! Я Ненси. Помогу создать курс, настроить тренировку или назначить план обучения сотрудникам.",
  hr:
    "Привет! Я Ненси. Помогу с вакансиями, кандидатами и наймом. Могу улучшить текст вакансии или подсказать вопросы для собеседования.",
  onboarding:
    "Привет! Я Ненси — твой AI-наставник. Спрашивай что угодно о компании: процессы, документы, кто за что отвечает. Помогу с адаптацией новых сотрудников.",
  sales:
    "Привет! Я Ненси. Помогу с CRM — клиенты, сделки, аналитика продаж.",
  tasks:
    "Привет! Я Ненси. Помогу с задачами — приоритизация, декомпозиция, управление проектами.",
  marketing:
    "Привет! Я Ненси. Помогу с маркетингом — кампании, контент, аналитика.",
  logistics:
    "Привет! Я Ненси. Помогу с логистикой — склады, заказы, поставщики.",
  platform:
    "Привет! Я Ненси — AI-ассистент Company24.pro. Чем могу помочь?",
}

function makeWelcome(module: ModuleContext): Message {
  return { id: "welcome", role: "assistant", content: WELCOME_MESSAGES[module] }
}

// ─── Prompts ──────────────────────────────────────────────────────────────

const BASE_PROMPT = `Ты — Ненси, AI-ассистент платформы Company24.pro — модульной бизнес-системы для российских компаний.

═══════════════════════════════════════
РОЛЬ И ХАРАКТЕР
═══════════════════════════════════════
Ты — опытный бизнес-консультант и помощник внутри компании. В зависимости от того, где сейчас находится пользователь, ты фокусируешься на задачах соответствующего модуля.

Тон: дружелюбный, но профессиональный. Обращайся на «вы». Используй эмодзи умеренно (1-2 на ответ). Отвечай по-русски. Не выдумывай факты о компании — используй только предоставленный контекст. Не пиши больше 2000 слов за один ответ — лучше разбей на части.

Ниже описан контекст того модуля, в котором пользователь сейчас работает — именно в его рамках и отвечай.`

const KNOWLEDGE_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: БАЗА ЗНАНИЙ
═══════════════════════════════════════

Твоя задача здесь — помогать сотрудникам находить информацию, а руководителям — создавать качественные корпоративные документы.

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
- НЕ давай юридических гарантий — всегда добавляй дисклеймер к правовым документам
- Если вопрос не про базу знаний — вежливо перенаправь: «Этот вопрос лучше задать в модуле [HR/CRM/Задачи]»`

const LEARNING_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: ОБУЧЕНИЕ
═══════════════════════════════════════

Твоя задача здесь — помогать с созданием AI-курсов, тренировками с AI (ролевые игры), планами обучения, геймификацией и сертификатами.

Что умеешь подсказать:
- Как собрать AI-курс из YouTube-видео, статей, файлов
- Как настроить тренировку-симуляцию (ролевую игру с AI)
- Как назначить план обучения сотруднику, как отслеживать прогресс
- Как сделать курс с тестом и сертификатом
- Как работает геймификация и лидерборд

Если пользователь просит создать материал — предложи сделать AI-курс и уточни: (1) тема, (2) для какой роли, (3) формат (видео / текст / смешанный), (4) есть ли готовые источники (ссылки / файлы).`

const HR_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: НАЙМ / HR
═══════════════════════════════════════

Твоя задача здесь — помогать с вакансиями, кандидатами, презентациями должностей, собеседованиями и интеграцией с hh.ru.

Что умеешь подсказать:
- Как улучшить текст вакансии (УТП работодателя, структура, ключевые требования)
- Какие вопросы задать на собеседовании под конкретную роль
- Как настроить воронку найма и скоринг кандидатов
- Как сделать презентацию должности (demo template) для кандидата
- Как опубликовать вакансию на hh.ru и подтянуть отклики

Если просят написать вакансию — уточни: (1) должность, (2) отдел, (3) вилка зарплаты, (4) ключевые требования, (5) 2-3 главных преимущества работодателя.`

const SALES_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: CRM / ПРОДАЖИ
═══════════════════════════════════════

Твоя задача здесь — помогать с компаниями, контактами, сделками и воронкой продаж.

Что умеешь подсказать:
- Как структурировать клиентскую базу, какие поля вести
- Как настроить этапы воронки продаж под конкретный бизнес
- Как анализировать конверсию между этапами и находить узкие места
- Как работать с возражениями, скрипты для холодных/тёплых звонков
- Как прогнозировать выручку по pipeline

Если спрашивают про конкретный клиент/сделку — используй контекст, не выдумывай детали.`

const TASKS_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: ЗАДАЧИ
═══════════════════════════════════════

Твоя задача здесь — помогать с управлением задачами, проектами, приоритизацией и декомпозицией.

Что умеешь подсказать:
- Как разбить большую цель на конкретные задачи с дедлайнами
- Как приоритизировать по матрице Эйзенхауэра / ICE / RICE
- Как вести проект по спринтам, как планировать недели
- Как делегировать задачи и контролировать исполнение`

const MARKETING_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: МАРКЕТИНГ
═══════════════════════════════════════

Твоя задача здесь — помогать с кампаниями, контент-планом, аналитикой, email-рассылками и SEO.

Что умеешь подсказать:
- Как спланировать контент-стратегию на месяц/квартал
- Как запустить email-кампанию и рассчитать метрики (Open Rate, CTR, конверсия)
- Как работать с SEO: ключевые слова, структура страницы, метатеги
- Как настроить аналитику и считать ROI каналов`

const LOGISTICS_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: ЛОГИСТИКА
═══════════════════════════════════════

Твоя задача здесь — помогать со складами, заказами, отгрузками, инвентаризацией и поставщиками.

Что умеешь подсказать:
- Как организовать складской учёт и инвентаризацию
- Как оптимизировать маршруты и сократить издержки доставки
- Как работать с поставщиками: договоры, сроки, рекламации
- Как считать складские остатки и прогнозировать закупки`

const PLATFORM_PROMPT = `
═══════════════════════════════════════
ОБЩИЕ НАСТРОЙКИ ПЛАТФОРМЫ
═══════════════════════════════════════

Пользователь сейчас в разделе общих настроек Company24.pro (не в конкретном модуле).

Помогай с:
- Настройкой компании: профиль, реквизиты, брендинг
- Командой и ролями: приглашения, права доступа, видимость
- Тарифом и биллингом: что входит, как изменить
- Интеграциями: подключение внешних сервисов
- Подключением модулей (HR, Обучение, CRM и т.д.) к тарифу

Если просят что-то специфичное для модуля — подскажи открыть соответствующий модуль и задать вопрос там.`

const ONBOARDING_PROMPT = `
═══════════════════════════════════════
МОДУЛЬ: АДАПТАЦИЯ И ОНБОРДИНГ
═══════════════════════════════════════

Ты — AI-наставник для новых сотрудников и HR-менеджеров, работающих с адаптацией.

Для HR-менеджеров:
- Помогай отслеживать прогресс адаптации новичков
- Подсказывай что делать если сотрудник отстаёт
- Помогай с планами адаптации и чек-листами

Для новых сотрудников:
- Отвечай на вопросы о компании, процессах, где что найти
- Используй базу знаний компании для ответов
- Будь дружелюбной и терпеливой
- Подсказывай быстрые ответы: как оформить отпуск, где регламенты, структура компании, задачи на адаптацию

Быстрые темы для новичков:
- Организационная структура компании
- Внутренние регламенты и процедуры
- Оформление документов (отпуск, больничный, командировка)
- Корпоративная культура и ценности
- Контакты ключевых людей
`

const MODULE_PROMPTS: Record<ModuleContext, string> = {
  knowledge: KNOWLEDGE_PROMPT,
  learning: LEARNING_PROMPT,
  hr: HR_PROMPT,
  onboarding: ONBOARDING_PROMPT,
  sales: SALES_PROMPT,
  tasks: TASKS_PROMPT,
  marketing: MARKETING_PROMPT,
  logistics: LOGISTICS_PROMPT,
  platform: PLATFORM_PROMPT,
}

// ─── User profile block (injected into every prompt) ────────────────────

function buildUserContext(role: UserRole): string {
  return `
═══════════════════════════════════════
ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ
═══════════════════════════════════════
Роль в системе: ${ROLE_LABELS[role]}
Должность: не указана
Отдел: не указан

Подстраивай тон, уровень детализации и предложения под роль пользователя:
- Руководителям (Директор, Главный HR, HR-менеджер, Администратор платформы) — предлагай СОЗДАВАТЬ материалы, УПРАВЛЯТЬ процессами, АНАЛИЗИРОВАТЬ метрики. Формулируй как партнёр по бизнесу.
- Исполнителям (Сотрудник, Наблюдатель) — предлагай НАЙТИ нужную информацию, ЗАДАТЬ вопрос, ПРОЙТИ обучение. Формулируй как помощник.
- Руководитель отдела — промежуточный случай: может и создавать в пределах отдела, и искать для своей команды. Адаптируйся по контексту вопроса.
`
}

function getSystemPrompt(module: ModuleContext, role: UserRole): string {
  return BASE_PROMPT + "\n" + buildUserContext(role) + "\n" + MODULE_PROMPTS[module]
}

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

// Extract a short title from assistant message content (first line or first N chars)
function extractTitle(content: string): string {
  // Try first markdown heading
  const headingMatch = content.match(/^#+\s+(.+)/m)
  if (headingMatch) return headingMatch[1].slice(0, 100)
  // Try first bold text
  const boldMatch = content.match(/\*\*(.+?)\*\*/)
  if (boldMatch) return boldMatch[1].slice(0, 100)
  // Fall back to first line, trimmed
  const firstLine = content.split("\n").find((l) => l.trim().length > 5)?.trim() || content.trim()
  return firstLine.slice(0, 100)
}

export function AiAssistantWidget() {
  const pathname = usePathname() || "/"
  const moduleContext = detectModule(pathname)
  const { role } = useAuth()

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>(() => [
    makeWelcome(detectModule(pathname)),
  ])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [hasSpeech, setHasSpeech] = useState(false)

  // ── TTS (озвучка ответов Ненси) ─────────────────────────────────────────
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const ruVoiceRef = useRef<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const ru = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("ru"))
      const female =
        ru.find((v) => /milena|irina|katya|alena|anna|женск|female/i.test(v.name)) ??
        ru[0] ??
        null
      ruVoiceRef.current = female
    }
    pickVoice()
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pickVoice)
      window.speechSynthesis.cancel()
    }
  }, [])

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    try {
      window.speechSynthesis.cancel()
      // Убираем markdown чтобы озвучка не читала звёздочки и решётки
      const clean = text
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/^#+\s+/gm, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      const utter = new SpeechSynthesisUtterance(clean)
      utter.lang = "ru-RU"
      utter.rate = 1.0
      utter.pitch = 1.0
      if (ruVoiceRef.current) utter.voice = ruVoiceRef.current
      utter.onstart = () => setIsSpeaking(true)
      utter.onend = () => setIsSpeaking(false)
      utter.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utter)
    } catch (err) {
      console.error("[ai-assistant] tts failed", err)
      setIsSpeaking(false)
    }
  }

  const stopSpeaking = () => {
    if (typeof window === "undefined") return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  const toggleTts = () => {
    if (ttsEnabled) {
      stopSpeaking()
      setTtsEnabled(false)
    } else {
      setTtsEnabled(true)
    }
  }
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

  // When the user navigates to a different module, refresh the welcome
  // message at the top of the chat to match the new module context —
  // but keep any existing user/assistant history intact so a mid-chat
  // navigation inside the same module doesn't wipe the conversation.
  const prevModuleRef = useRef<ModuleContext>(moduleContext)
  useEffect(() => {
    if (prevModuleRef.current === moduleContext) return
    prevModuleRef.current = moduleContext
    setMessages((prev) =>
      prev.map((m) =>
        m.id === "welcome"
          ? { ...m, content: WELCOME_MESSAGES[moduleContext] }
          : m,
      ),
    )
  }, [moduleContext])

  // Save assistant message to knowledge base
  const saveToKnowledge = async (msg: Message) => {
    if (savingId || msg.saved) return
    setSavingId(msg.id)
    try {
      const title = extractTitle(msg.content)
      const res = await fetch("/api/modules/knowledge/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: msg.content,
          status: "draft",
          audience: ["employees"],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Ошибка сохранения")
      }
      // Mark as saved
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, saved: true } : m))
      )
    } catch (err) {
      console.error("[save-to-knowledge]", err)
      alert("Не удалось сохранить. Попробуйте ещё раз.")
    }
    setSavingId(null)
  }

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
          system: getSystemPrompt(moduleContext, role),
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

      // Озвучка если включено
      if (ttsEnabled) {
        speakText(answer)
      }

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

  // ── Proactive tips ──
  const [proactiveTip, setProactiveTip] = useState<{ text: string; action: () => void } | null>(null)
  useEffect(() => {
    if (open) { setProactiveTip(null); return }
    try {
      const shownTips = JSON.parse(localStorage.getItem("nancy_shown_tips") || "[]") as string[]
      const tipKey = `tip:${pathname}`
      if (shownTips.includes(tipKey)) return

      // Check for proactive tips based on page
      if (pathname.startsWith("/hr/vacancies") && !pathname.includes("/")) {
        setProactiveTip({
          text: "У вас есть кандидаты без AI-скрининга? Нажмите чтобы запустить!",
          action: () => { window.location.href = "/hr/vacancies" },
        })
        localStorage.setItem("nancy_shown_tips", JSON.stringify([...shownTips, tipKey]))
      } else if (pathname === "/hr/dashboard" || pathname === "/overview") {
        setProactiveTip({
          text: "Хотите увидеть отчёт за неделю?",
          action: () => { setOpen(true); setInput("Покажи отчёт за неделю"); setTimeout(() => send(), 100) },
        })
        localStorage.setItem("nancy_shown_tips", JSON.stringify([...shownTips, tipKey]))
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, open])

  return (
    <>
      {/* Floating button + proactive tip */}
      {!open && (
        <div className="fixed bottom-4 right-4 z-50 flex items-end gap-2">
          {proactiveTip && (
            <div
              className="max-w-[220px] bg-white dark:bg-gray-900 border shadow-lg rounded-xl rounded-br-sm px-3 py-2 text-xs text-foreground animate-in slide-in-from-right-2 cursor-pointer hover:bg-muted/50 transition-colors relative"
              onClick={() => { proactiveTip.action(); setProactiveTip(null) }}
            >
              <button type="button" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground z-10" onClick={e => { e.stopPropagation(); setProactiveTip(null) }}>
                <X className="w-2.5 h-2.5" />
              </button>
              <p>{proactiveTip.text}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Открыть Ненси"
            className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform overflow-hidden border-2 border-primary p-0 shrink-0"
          >
            <Image src="/nancy-avatar.png" alt="Ненси" width={64} height={64} className="w-full h-full object-cover" />
          </button>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col bg-background border border-border shadow-2xl animate-in slide-in-from-bottom-4 duration-200",
            expanded
              ? "inset-4 rounded-2xl"
              : "bottom-20 right-4 w-96 rounded-2xl resize-y overflow-hidden min-h-[300px] max-h-[85vh] h-[500px]"
          )}
          role="dialog"
          aria-label="Ненси"
        >
          {/* Header */}
          <div className="bg-primary text-primary-foreground rounded-t-2xl px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Image src="/nancy-avatar.png" alt="Ненси" width={44} height={44} className="rounded-full" />
              <span className="font-semibold text-sm">Ненси — AI-ассистент</span>
            </div>
            <div className="flex items-center gap-1">
              {isSpeaking && (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  aria-label="Остановить озвучку"
                  className="hover:opacity-80 transition-opacity p-1 rounded"
                  title="Остановить озвучку"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={toggleTts}
                aria-label={ttsEnabled ? "Выключить озвучку" : "Включить озвучку"}
                title={ttsEnabled ? "Выключить озвучку" : "Включить озвучку"}
                className={cn(
                  "hover:opacity-80 transition-opacity p-1 rounded",
                  ttsEnabled && "bg-white/15",
                  isSpeaking && "animate-pulse",
                )}
              >
                {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Свернуть" : "На весь экран"}
                className="hover:opacity-80 transition-opacity p-1 rounded"
              >
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setExpanded(false); stopSpeaking() }}
                aria-label="Закрыть"
                className="hover:opacity-80 transition-opacity p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "rounded-2xl p-3 text-sm",
                    expanded ? "max-w-[70%]" : "max-w-[85%]",
                    m.role === "user"
                      ? "bg-primary/10 rounded-br-sm ml-8"
                      : "bg-muted rounded-bl-sm mr-8",
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>

                  {/* Cited sources */}
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

                  {/* Save to knowledge base button — only for non-welcome assistant messages */}
                  {m.role === "assistant" && m.id !== "welcome" && !m.id.startsWith("err-") && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <button
                        type="button"
                        onClick={() => saveToKnowledge(m)}
                        disabled={!!savingId || m.saved}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors",
                          m.saved
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-primary/5 text-primary hover:bg-primary/10",
                          (!!savingId && savingId !== m.id) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {savingId === m.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Сохраняю...</>
                        ) : m.saved ? (
                          <><Check className="w-3 h-3" /> Сохранено в базу</>
                        ) : (
                          <><BookmarkPlus className="w-3 h-3" /> Сохранить в базу</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Quick actions for onboarding */}
            {moduleContext === "onboarding" && messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 px-2">
                {["Как оформить отпуск?", "Где найти регламенты?", "Структура компании", "Мои задачи на адаптацию"].map(q => (
                  <button key={q} type="button" onClick={() => { setInput(q); setTimeout(() => send(), 50) }}
                    className="text-xs bg-primary/10 text-primary rounded-full px-3 py-1.5 hover:bg-primary/20 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            )}

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
          <div className="border-t border-border px-4 py-3 flex gap-2 items-center shrink-0">
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
