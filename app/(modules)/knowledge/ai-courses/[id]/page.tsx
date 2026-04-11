"use client"

import { useState, useRef, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ChevronRight, ChevronDown, Plus, X, Sparkles, BookOpen, Youtube, FileText,
  Type, Upload, Loader2, Save, RefreshCw, ExternalLink, Search, Trash2,
  CheckCircle2, FolderOpen, Coins, AlertCircle, Lock as LockIcon, Play, HardDrive,
  Cloud, Link as LinkIcon, HelpCircle,
  FileSearch, ListTree, BookOpenCheck, ClipboardCheck, PartyPopper,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Source {
  type: "article" | "video" | "file" | "text"
  title: string
  content: string
  url?: string
  wordCount?: number
}

interface TestQuestion {
  question: string
  options: string[]
  correct_index: number
}

interface GeneratedLesson {
  title: string
  content_markdown: string
  duration_minutes: number
  test?: { questions: TestQuestion[] }
}

interface GeneratedModule {
  title: string
  description: string
  lessons: GeneratedLesson[]
}

interface GeneratedResult {
  title: string
  description: string
  modules: GeneratedModule[]
}

interface KnowledgeArticle {
  id: string; slug: string; title: string; category: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { value: "new_employees",  label: "Новые сотрудники" },
  { value: "line_staff",     label: "Линейный персонал" },
  { value: "managers",       label: "Менеджеры" },
  { value: "executives",     label: "Руководители" },
  { value: "all",            label: "Все" },
]

const FORMAT_OPTIONS = [
  { value: "mini",     label: "Мини-курс ~15 мин" },
  { value: "standard", label: "Стандартный ~1-2 часа" },
  { value: "full",     label: "Полный ~4 часов" },
]

const TONE_OPTIONS = [
  { value: "formal",    label: "Формальный" },
  { value: "friendly",  label: "Дружелюбный" },
  { value: "casual",    label: "Разговорный" },
]

interface GenerationStage {
  label: string
  icon: React.ComponentType<{ className?: string }>
  durationMs: number
}

const PROGRESS_STAGE_DATA: GenerationStage[] = [
  { label: "Анализирую источники...",   icon: FileSearch,     durationMs: 1500 },
  { label: "Создаю структуру курса...", icon: ListTree,       durationMs: 2500 },
  { label: "Генерирую уроки...",        icon: BookOpenCheck,  durationMs: 4000 },
  { label: "Создаю тесты...",           icon: ClipboardCheck, durationMs: 2500 },
  { label: "Финализирую...",            icon: Sparkles,       durationMs: 1000 },
]

// Legacy alias — use the new data shape
const PROGRESS_STAGES = PROGRESS_STAGE_DATA.map((s) => s.label)

// Mock articles for picker
const MOCK_ARTICLES: KnowledgeArticle[] = [
  { id: "1", slug: "kak-oformit-otpusk",         title: "Как оформить отпуск",           category: "HR-политики" },
  { id: "2", slug: "nastroyka-vpn",               title: "Настройка VPN",                 category: "IT и безопасность" },
  { id: "3", slug: "skript-kholodnogo-zvonka-v2", title: "Скрипт холодного звонка v2",    category: "Продажи" },
  { id: "4", slug: "chek-list-pervogo-dnya",       title: "Чек-лист первого дня",         category: "Онбординг" },
  { id: "5", slug: "kak-zakazat-kantstovary",     title: "Как заказать канцтовары",       category: "Регламенты" },
  { id: "6", slug: "rabota-s-crm",                title: "Работа с CRM",                  category: "Продажи" },
  { id: "7", slug: "paroli-i-2fa",                title: "Пароли и двухфакторная защита", category: "IT и безопасность" },
  { id: "8", slug: "obrabotka-vozrazheniy",       title: "Обработка возражений",          category: "Продажи" },
  { id: "9", slug: "struktura-kompanii",          title: "Структура компании",            category: "Онбординг" },
  { id: "10", slug: "kpi-i-bonusy",               title: "KPI и бонусы",                  category: "HR-политики" },
]

const MOCK_ARTICLE_CONTENT: Record<string, string> = {
  "1": "Как оформить отпуск. Заявление подаётся за 14 дней. Виды отпуска: ежегодный оплачиваемый, без сохранения ЗП, учебный. Порядок согласования: руководитель → HR → приказ.",
  "2": "Настройка VPN. Шаг 1: получите учётные данные. Шаг 2: скачайте WireGuard. Шаг 3: импортируйте конфиг. Шаг 4: подключитесь.",
  "3": "Скрипт холодного звонка v2. Приветствие → Квалификация → Презентация → Возражения → Встреча.",
  "4": "Чек-лист первого дня. Пропуск, рабочее место, приложения, команда, обед, wiki.",
  "5": "Как заказать канцтовары. Раздел Заявки → Каталог → Согласование → 3-5 дней.",
  "6": "Работа с CRM. Сделки, воронка, карточка клиента, задачи, отчёты.",
  "7": "Пароли и 2FA. Минимум 12 символов. Google Authenticator обязателен.",
  "8": "Обработка возражений. Дорого, подумаю, не нужно, есть поставщик. Присоединение, уточнение, аргумент, закрытие.",
  "9": "Структура компании. ГД → Директора → Руководители → Специалисты.",
  "10": "KPI и бонусы. Квартальные KPI. <80% — нет бонуса, 80-100% — пропорционально, >100% — повышенный.",
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function formatTokens(n: number): string {
  if (n === 0) return "0"
  return n.toLocaleString("ru-RU")
}

// ─── Source type icons ───────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, { icon: React.ReactNode; bg: string }> = {
  article: { icon: <BookOpen className="size-4 text-violet-600" />, bg: "bg-violet-50 border-violet-200" },
  video:   { icon: <Youtube className="size-4 text-red-600" />, bg: "bg-red-50 border-red-200" },
  file:    { icon: <FileText className="size-4 text-blue-600" />, bg: "bg-blue-50 border-blue-200" },
  text:    { icon: <Type className="size-4 text-emerald-600" />, bg: "bg-emerald-50 border-emerald-200" },
}

// ─── URL platform meta (auto-detect icons) ──────────────────────────────────

const URL_PLATFORM_META: Record<
  "youtube" | "rutube" | "vk" | "google_drive" | "yandex_disk" | "direct" | "unknown",
  { icon: React.ReactNode; label: string }
> = {
  youtube:      { icon: <Youtube className="size-3.5 text-red-500" />,     label: "YouTube" },
  rutube:       { icon: <Play className="size-3.5 text-[#01afe8]" />,      label: "Rutube" },
  vk:           { icon: <Play className="size-3.5 text-[#0077ff]" />,      label: "VK" },
  google_drive: { icon: <HardDrive className="size-3.5 text-[#0f9d58]" />, label: "G.Drive" },
  yandex_disk:  { icon: <Cloud className="size-3.5 text-[#fc3f1d]" />,     label: "Я.Диск" },
  direct:       { icon: <LinkIcon className="size-3.5 text-blue-500" />,   label: "Link" },
  unknown:      { icon: <HelpCircle className="size-3.5 text-muted-foreground" />, label: "" },
}

// ─── Mock initial data kept as fallback if API returns nothing ────────────────
// Used only as a safety net — real data comes from GET /api/modules/knowledge/ai-courses/[id]

const MOCK_PROJECT_DATA: Record<string, {
  title: string; description: string; status: string;
  sources: Source[]; result: GeneratedResult | null;
  tokensInput: number; tokensOutput: number; costUsd: string;
}> = {
  "proj-1": {
    title: "Онбординг менеджеров", description: "Курс по адаптации новых менеджеров",
    status: "ready",
    sources: [
      { type: "article", title: "Чек-лист первого дня", content: MOCK_ARTICLE_CONTENT["4"] ?? "", wordCount: 12 },
      { type: "article", title: "Структура компании", content: MOCK_ARTICLE_CONTENT["9"] ?? "", wordCount: 9 },
      { type: "text", title: "Текст (45 слов)", content: "Процесс адаптации включает знакомство с командой, изучение продукта, прохождение обучения и сдачу тестов. Наставник сопровождает нового сотрудника первые 2 недели.", wordCount: 45 },
      { type: "video", title: "YouTube: Адаптация", content: "Видео о процессе адаптации в современных компаниях", url: "https://youtube.com/watch?v=example1", wordCount: 120 },
    ],
    result: {
      title: "Онбординг менеджеров", description: "Комплексный курс по адаптации новых руководителей.",
      modules: [
        { title: "Модуль 1: Знакомство", description: "Первые шаги", lessons: [
          { title: "Первый день", content_markdown: "## Первый день\n\nЧто нужно сделать в первый рабочий день.", duration_minutes: 10, test: { questions: [{ question: "Что первое нужно получить?", options: ["Пропуск", "Зарплату", "Отпуск", "Кресло"], correct_index: 0 }] } },
          { title: "Команда и структура", content_markdown: "## Структура\n\nОсновные подразделения компании.", duration_minutes: 12 },
          { title: "Инструменты", content_markdown: "## Инструменты\n\nОсновные рабочие инструменты и системы.", duration_minutes: 8, test: { questions: [{ question: "Какой мессенджер используется?", options: ["WhatsApp", "Slack", "Telegram", "ICQ"], correct_index: 1 }] } },
        ]},
        { title: "Модуль 2: Процессы", description: "Как всё работает", lessons: [
          { title: "Регламенты", content_markdown: "## Регламенты\n\nОсновные процедуры и правила.", duration_minutes: 15 },
          { title: "KPI и оценка", content_markdown: "## KPI\n\nСистема оценки эффективности.", duration_minutes: 12, test: { questions: [{ question: "Как часто проводится оценка?", options: ["Еженедельно", "Ежемесячно", "Ежеквартально", "Ежегодно"], correct_index: 2 }] } },
          { title: "Культура компании", content_markdown: "## Культура\n\nЦенности и принципы работы.", duration_minutes: 10 },
          { title: "Наставничество", content_markdown: "## Наставник\n\nКак работает система наставничества.", duration_minutes: 8 },
          { title: "Итоги и тест", content_markdown: "## Итоги\n\nПроверка знаний по всему курсу.", duration_minutes: 10, test: { questions: [{ question: "Сколько длится период адаптации?", options: ["1 неделя", "2 недели", "1 месяц", "3 месяца"], correct_index: 2 }] } },
        ]},
      ],
    },
    tokensInput: 12450, tokensOutput: 3200, costUsd: "0.0535",
  },
  "proj-2": {
    title: "Продуктовое обучение", description: "Знакомство с продуктом для отдела продаж",
    status: "draft",
    sources: [
      { type: "article", title: "Работа с CRM", content: MOCK_ARTICLE_CONTENT["6"] ?? "", wordCount: 10 },
      { type: "file", title: "product-guide.pdf", content: "Руководство по продукту компании...", wordCount: 500 },
    ],
    result: null,
    tokensInput: 0, tokensOutput: 0, costUsd: "0",
  },
  "proj-3": {
    title: "Безопасность на производстве", description: "Обязательный курс по ТБ",
    status: "published",
    sources: [
      { type: "article", title: "Настройка VPN", content: MOCK_ARTICLE_CONTENT["2"] ?? "", wordCount: 18 },
      { type: "article", title: "Пароли и 2FA", content: MOCK_ARTICLE_CONTENT["7"] ?? "", wordCount: 12 },
      { type: "file", title: "safety-rules.docx", content: "Правила техники безопасности...", wordCount: 800 },
      { type: "file", title: "fire-instructions.pdf", content: "Инструкция при пожаре...", wordCount: 300 },
      { type: "text", title: "Текст (60 слов)", content: "Дополнительные правила безопасности на рабочем месте...", wordCount: 60 },
      { type: "video", title: "YouTube: ТБ инструктаж", content: "Видеоинструктаж по технике безопасности", url: "https://youtube.com/watch?v=example2", wordCount: 200 },
    ],
    result: {
      title: "Безопасность на производстве", description: "Обязательный курс по охране труда и ТБ.",
      modules: [
        { title: "Модуль 1: Основы ТБ", description: "Базовые правила", lessons: [
          { title: "Введение в ТБ", content_markdown: "## ТБ\n\nОсновные правила.", duration_minutes: 10 },
          { title: "Пожарная безопасность", content_markdown: "## Пожарная безопасность\n\nДействия при пожаре.", duration_minutes: 15, test: { questions: [{ question: "Куда звонить при пожаре?", options: ["101", "102", "103", "112"], correct_index: 0 }] } },
          { title: "Электробезопасность", content_markdown: "## Электробезопасность\n\nПравила работы с электрооборудованием.", duration_minutes: 12 },
          { title: "Средства защиты", content_markdown: "## СИЗ\n\nСредства индивидуальной защиты.", duration_minutes: 10, test: { questions: [{ question: "Что такое СИЗ?", options: ["Система защиты", "Средства индивидуальной защиты", "Система информации", "Стандарт безопасности"], correct_index: 1 }] } },
        ]},
        { title: "Модуль 2: IT-безопасность", description: "Цифровая безопасность", lessons: [
          { title: "Пароли", content_markdown: "## Пароли\n\nТребования к паролям.", duration_minutes: 8 },
          { title: "Двухфакторная защита", content_markdown: "## 2FA\n\nНастройка 2FA.", duration_minutes: 10, test: { questions: [{ question: "Минимальная длина пароля?", options: ["6", "8", "10", "12"], correct_index: 3 }] } },
          { title: "VPN", content_markdown: "## VPN\n\nНастройка корпоративного VPN.", duration_minutes: 12 },
          { title: "Фишинг", content_markdown: "## Фишинг\n\nКак распознать фишинг.", duration_minutes: 10 },
        ]},
        { title: "Модуль 3: Практика", description: "Закрепление", lessons: [
          { title: "Кейсы из практики", content_markdown: "## Кейсы\n\nРеальные примеры нарушений.", duration_minutes: 15 },
          { title: "Действия при ЧП", content_markdown: "## ЧП\n\nАлгоритм действий.", duration_minutes: 12 },
          { title: "Отчётность", content_markdown: "## Отчёты\n\nОформление отчётов по ТБ.", duration_minutes: 8 },
          { title: "Итоговый тест", content_markdown: "## Итоги\n\nФинальная проверка.", duration_minutes: 15, test: { questions: [{ question: "Кто отвечает за ТБ?", options: ["HR", "Каждый сотрудник", "Только начальник", "IT-отдел"], correct_index: 1 }] } },
        ]},
      ],
    },
    tokensInput: 22800, tokensOutput: 5600, costUsd: "0.1524",
  },
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiCourseProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sources
  const [sources, setSources] = useState<Source[]>([])
  const [showArticlePicker, setShowArticlePicker] = useState(false)
  const [articleSearch, setArticleSearch] = useState("")
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([])
  const [showTextDialog, setShowTextDialog] = useState(false)
  const [pasteText, setPasteText] = useState("")

  // Multi-URL rows (draft inputs, каждый можно fetch'ить отдельно)
  interface UrlRow {
    id: string
    url: string
    username: string
    password: string
    showAuth: boolean
    loading: boolean
  }
  const [urlRows, setUrlRows] = useState<UrlRow[]>([
    { id: `r-${Date.now()}`, url: "", username: "", password: "", showAuth: false, loading: false },
  ])

  // Drag-drop state for files
  const [fileDragActive, setFileDragActive] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)

  // Settings
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [audience, setAudience] = useState("new_employees")
  const [format, setFormat] = useState("standard")
  const [tone, setTone] = useState("friendly")
  const [withTests, setWithTests] = useState(true)
  const [withSummary, setWithSummary] = useState(true)

  // Loading (initial fetch)
  const [loadingProject, setLoadingProject] = useState(true)

  // Generation
  const [generating, setGenerating] = useState(false)
  const [genStage, setGenStage] = useState(0)
  const [genProgress, setGenProgress] = useState(0)
  const [result, setResult] = useState<GeneratedResult | null>(null)
  const [tokensInput, setTokensInput] = useState(0)
  const [tokensOutput, setTokensOutput] = useState(0)
  const [costUsd, setCostUsd] = useState("0")
  const [genError, setGenError] = useState<string | null>(null)

  // Publishing
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)

  // ─── Load project from API ─────────────────────────────────────────────────

  useEffect(() => {
    if (!id || id === "new") {
      setLoadingProject(false)
      return
    }
    void (async () => {
      setLoadingProject(true)
      try {
        const res = await fetch(`/api/modules/knowledge/ai-courses/${id}`)
        if (!res.ok) {
          // Fallback to mock data if the project is one of the legacy mocked ids
          if (MOCK_PROJECT_DATA[id]) {
            const mock = MOCK_PROJECT_DATA[id]
            setTitle(mock.title)
            setDescription(mock.description)
            setSources(mock.sources)
            setResult(mock.result)
            setTokensInput(mock.tokensInput)
            setTokensOutput(mock.tokensOutput)
            setCostUsd(mock.costUsd)
          } else {
            toast.error("Проект не найден")
          }
          return
        }
        const project = (await res.json()) as {
          title: string
          description: string | null
          sources: Source[] | null
          params: {
            audience?: string
            format?: string
            tone?: string
            withTests?: boolean
            withSummary?: boolean
          } | null
          result: GeneratedResult | null
          tokensInput: number | null
          tokensOutput: number | null
          costUsd: string | null
        }
        setTitle(project.title ?? "")
        setDescription(project.description ?? "")
        setSources(Array.isArray(project.sources) ? project.sources : [])
        if (project.params) {
          if (project.params.audience) setAudience(project.params.audience)
          if (project.params.format) setFormat(project.params.format)
          if (project.params.tone) setTone(project.params.tone)
          if (project.params.withTests !== undefined) setWithTests(project.params.withTests)
          if (project.params.withSummary !== undefined) setWithSummary(project.params.withSummary)
        }
        setResult(project.result ?? null)
        setTokensInput(project.tokensInput ?? 0)
        setTokensOutput(project.tokensOutput ?? 0)
        setCostUsd(project.costUsd ?? "0")
      } catch {
        toast.error("Ошибка загрузки")
      } finally {
        setLoadingProject(false)
      }
    })()
  }, [id])

  // ─── Token estimation ──────────────────────────────────────────────────────

  const totalWords = sources.reduce((s, src) => s + (src.wordCount ?? wordCount(src.content)), 0)
  const estimatedTokens = Math.ceil(totalWords * 1.3)
  const estimatedCost = ((estimatedTokens * 3 + 2000 * 15) / 1_000_000).toFixed(4)

  // ─── Source management ─────────────────────────────────────────────────────

  const removeSource = (idx: number) => setSources((prev) => prev.filter((_, i) => i !== idx))

  const handleConfirmArticles = () => {
    const newSources = selectedArticleIds
      .filter((aid) => !sources.some((s) => s.type === "article" && s.title === MOCK_ARTICLES.find((a) => a.id === aid)?.title))
      .map((aid) => {
        const article = MOCK_ARTICLES.find((a) => a.id === aid)!
        const content = MOCK_ARTICLE_CONTENT[aid] ?? ""
        return { type: "article" as const, title: article.title, content, wordCount: wordCount(content) }
      })
    setSources((prev) => [...prev, ...newSources])
    setShowArticlePicker(false)
    setSelectedArticleIds([])
  }

  // ─── Multi-URL handling ────────────────────────────────────────────────────

  type UrlPlatform = "youtube" | "rutube" | "vk" | "google_drive" | "yandex_disk" | "direct" | "unknown"

  function detectPlatform(url: string): UrlPlatform {
    if (!url.trim()) return "unknown"
    try {
      const u = new URL(url.trim())
      const host = u.hostname.toLowerCase().replace(/^www\./, "")
      if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube"
      if (host.includes("rutube.ru")) return "rutube"
      if (host.includes("vk.com") || host.includes("vkvideo.ru")) return "vk"
      if (host.includes("drive.google.com") || host.includes("docs.google.com")) return "google_drive"
      if (host.includes("disk.yandex") || host.includes("yadi.sk")) return "yandex_disk"
      return "direct"
    } catch {
      return "unknown"
    }
  }

  const addUrlRow = () => {
    setUrlRows((prev) => [
      ...prev,
      { id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: "", username: "", password: "", showAuth: false, loading: false },
    ])
  }

  const updateUrlRow = (rowId: string, patch: Partial<UrlRow>) => {
    setUrlRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)))
  }

  const removeUrlRow = (rowId: string) => {
    setUrlRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== rowId)))
  }

  const fetchUrlRow = async (rowId: string) => {
    const row = urlRows.find((r) => r.id === rowId)
    if (!row || !row.url.trim()) return
    const url = row.url.trim()
    const platform = detectPlatform(url)

    updateUrlRow(rowId, { loading: true })
    try {
      // YouTube по-прежнему идёт через старый endpoint (работает и без креденшлов)
      if (platform === "youtube") {
        const res = await fetch(`/api/modules/knowledge/ai-courses/youtube-transcript?url=${encodeURIComponent(url)}`)
        const data = await res.json()
        if (res.ok) {
          setSources((prev) => [...prev, {
            type: "video",
            title: data.title || "YouTube видео",
            content: data.transcript || "",
            url,
            wordCount: data.wordCount ?? 0,
          }])
          toast.success(data.title || "YouTube добавлен")
        } else {
          setSources((prev) => [...prev, { type: "video", title: "YouTube видео", content: "", url, wordCount: 0 }])
          toast.error(data.error || "Субтитры недоступны")
        }
      } else {
        const res = await fetch("/api/modules/knowledge/ai-courses/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            username: row.username || undefined,
            password: row.password || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Не удалось загрузить")
          return
        }
        const srcType: Source["type"] =
          platform === "rutube" || platform === "vk" ? "video" : "file"
        setSources((prev) => [...prev, {
          type: srcType,
          title: data.title || url,
          content: data.text || "",
          url,
          wordCount: data.wordCount ?? 0,
        }])
        toast.success(data.title || "Источник добавлен")
      }
      // очищаем поле
      updateUrlRow(rowId, { url: "", username: "", password: "", showAuth: false })
    } catch {
      toast.error("Ошибка сети")
    } finally {
      updateUrlRow(rowId, { loading: false })
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setFileUploading(true)
    try {
      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase()
        // .txt/.md читаем клиентом напрямую
        if (name.endsWith(".txt") || name.endsWith(".md")) {
          const text = await file.text()
          setSources((prev) => [...prev, {
            type: "file",
            title: file.name,
            content: text,
            wordCount: wordCount(text),
          }])
          toast.success(file.name)
          continue
        }
        // PDF/DOCX парсим на сервере
        if (name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc")) {
          const form = new FormData()
          form.append("file", file)
          try {
            const res = await fetch("/api/modules/knowledge/ai-courses/parse-file", {
              method: "POST",
              body: form,
            })
            const data = await res.json()
            if (!res.ok) {
              toast.error(`${file.name}: ${data.error || "ошибка парсинга"}`)
              continue
            }
            setSources((prev) => [...prev, {
              type: "file",
              title: data.title || file.name,
              content: data.text || "",
              wordCount: data.wordCount ?? 0,
            }])
            toast.success(file.name)
          } catch {
            toast.error(`${file.name}: ошибка сети`)
          }
          continue
        }
        toast.error(`${file.name}: неподдерживаемый формат`)
      }
    } finally {
      setFileUploading(false)
    }
  }

  const handleAddText = () => {
    const text = pasteText.trim()
    if (!text) return
    const wc = wordCount(text)
    setSources((prev) => [...prev, { type: "text", title: `Текст (${wc} слов)`, content: text, wordCount: wc }])
    setPasteText("")
    setShowTextDialog(false)
  }

  // ─── Save draft ────────────────────────────────────────────────────────────

  const saveProject = async (): Promise<string | null> => {
    if (!title.trim()) {
      toast.error("Введите название")
      return null
    }
    const params = { audience, format, tone, withTests, withSummary }
    try {
      if (id === "new") {
        // Create project via POST then PATCH sources/params
        const createRes = await fetch("/api/modules/knowledge/ai-courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), description: description.trim() }),
        })
        const created = await createRes.json()
        if (!createRes.ok) {
          toast.error(created.error || "Не удалось создать")
          return null
        }
        await fetch(`/api/modules/knowledge/ai-courses/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sources, params }),
        })
        router.replace(`/knowledge/ai-courses/${created.id}`)
        return created.id as string
      } else {
        const patchRes = await fetch(`/api/modules/knowledge/ai-courses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            sources,
            params,
          }),
        })
        if (!patchRes.ok) {
          const data = await patchRes.json().catch(() => ({}))
          toast.error(data.error || "Не удалось сохранить")
          return null
        }
        return id
      }
    } catch {
      toast.error("Ошибка сети")
      return null
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const savedId = await saveProject()
      if (savedId) toast.success("Черновик сохранён")
    } finally {
      setSaving(false)
    }
  }

  // ─── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (sources.length === 0) return

    // Ensure project exists (save first if new / unsaved)
    setSaving(true)
    const projectId = await saveProject()
    setSaving(false)
    if (!projectId) return

    setGenerating(true)
    setGenError(null)
    setResult(null)
    setGenStage(0)
    setGenProgress(0)

    const interval = setInterval(() => {
      setGenProgress((p) => (p >= 95 ? 95 : p + Math.random() * 8))
      setGenStage((p) => (p + 1 < PROGRESS_STAGES.length ? p + 1 : p))
    }, 2500)

    try {
      const res = await fetch(`/api/modules/knowledge/ai-courses/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      clearInterval(interval)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setGenError(data.error || "Ошибка генерации")
        setGenerating(false)
        return
      }

      const generated = (await res.json()) as GeneratedResult
      setResult(generated)
      setGenProgress(100)

      // Re-fetch project to get updated token counts persisted by the backend
      try {
        const pRes = await fetch(`/api/modules/knowledge/ai-courses/${projectId}`)
        if (pRes.ok) {
          const project = (await pRes.json()) as {
            tokensInput: number | null
            tokensOutput: number | null
            costUsd: string | null
          }
          setTokensInput(project.tokensInput ?? 0)
          setTokensOutput(project.tokensOutput ?? 0)
          setCostUsd(project.costUsd ?? "0")
        }
      } catch {
        // ignore, токены остаются как были
      }
    } catch {
      setGenError("Ошибка сети. Попробуйте ещё раз.")
    } finally {
      clearInterval(interval)
      setGenerating(false)
    }
  }

  // ─── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!result || id === "new") {
      toast.error("Сначала сохраните и сгенерируйте курс")
      return
    }
    setPublishing(true)
    try {
      const res = await fetch(`/api/modules/knowledge/ai-courses/${id}/publish`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Не удалось опубликовать")
        return
      }
      toast.success("Курс опубликован в раздел «Обучение»")
      router.push("/knowledge/ai-courses")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setPublishing(false)
    }
  }

  // ─── Filtered articles ─────────────────────────────────────────────────────

  const filteredArticles = MOCK_ARTICLES.filter((a) =>
    !articleSearch || a.title.toLowerCase().includes(articleSearch.toLowerCase()) || a.category.toLowerCase().includes(articleSearch.toLowerCase())
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          {/* Header */}
          <div className="border-b px-6 py-4" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
              <Link href="/knowledge" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <Link href="/knowledge/ai-courses" className="hover:text-foreground transition-colors">AI-курсы</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">{id === "new" ? "Новый проект" : title || "Проект"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-violet-500" />
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название AI-курса"
                className="text-xl font-semibold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-5 min-h-[calc(100vh-180px)]">

            {/* ═══ LEFT — Sources (col-span-2) ═══ */}
            <div className="col-span-2 border-r overflow-auto">
              <div className="px-5 py-4 border-b bg-muted/20 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Источники <span className="text-muted-foreground font-normal">({sources.length})</span></h2>
              </div>

              <div className="p-5 space-y-4">
                {/* ── Quick buttons: КБ / Текст ───────────────────────── */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start h-9 text-xs" onClick={() => { setSelectedArticleIds([]); setShowArticlePicker(true) }}>
                    <BookOpen className="size-3.5 text-violet-500" />
                    Из базы знаний
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start h-9 text-xs" onClick={() => setShowTextDialog(true)}>
                    <Type className="size-3.5 text-emerald-500" />
                    Текст
                  </Button>
                </div>

                {/* ── Multi-URL input ─────────────────────────────────── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">Ссылки</Label>
                    <span className="text-[10px] text-muted-foreground">
                      YouTube · Rutube · VK · Google Drive · Я.Диск · прямые
                    </span>
                  </div>
                  {urlRows.map((row) => {
                    const platform = detectPlatform(row.url)
                    const meta = URL_PLATFORM_META[platform]
                    const disabled = !row.url.trim() || row.loading
                    return (
                      <div key={row.id} className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                              {meta.icon}
                            </div>
                            <Input
                              placeholder="https://..."
                              value={row.url}
                              onChange={(e) => updateUrlRow(row.id, { url: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && !disabled && fetchUrlRow(row.id)}
                              className="h-9 pl-8 pr-16 text-xs"
                            />
                            {row.url.trim() && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground uppercase">
                                {meta.label}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 w-9 p-0"
                            onClick={() => updateUrlRow(row.id, { showAuth: !row.showAuth })}
                            title="Логин/пароль для закрытых ресурсов"
                          >
                            <LockIcon className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => fetchUrlRow(row.id)}
                            disabled={disabled}
                          >
                            {row.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                          </Button>
                          {urlRows.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeUrlRow(row.id)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>

                        {row.showAuth && (
                          <div className="grid grid-cols-2 gap-1.5 pl-1">
                            <Input
                              placeholder="Логин"
                              value={row.username}
                              onChange={(e) => updateUrlRow(row.id, { username: e.target.value })}
                              className="h-8 text-xs"
                              autoComplete="off"
                            />
                            <Input
                              type="password"
                              placeholder="Пароль"
                              value={row.password}
                              onChange={(e) => updateUrlRow(row.id, { password: e.target.value })}
                              className="h-8 text-xs"
                              autoComplete="off"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addUrlRow}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                  >
                    <Plus className="size-3" />
                    Добавить ещё ссылку
                  </Button>
                </div>

                {/* ── File drag-and-drop zone ─────────────────────────── */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setFileDragActive(true)
                  }}
                  onDragLeave={() => setFileDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setFileDragActive(false)
                    void handleFiles(e.dataTransfer.files)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
                    fileDragActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  {fileUploading ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Парсинг файла…
                    </div>
                  ) : (
                    <>
                      <Upload className="size-5 mx-auto mb-1.5 text-muted-foreground" />
                      <p className="text-xs font-medium">Перетащите файлы или нажмите для выбора</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">PDF, DOCX, TXT, MD — до 15MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  multiple
                  onChange={(e) => { void handleFiles(e.target.files); e.target.value = "" }}
                  className="hidden"
                />

                {/* Source list */}
                {sources.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {sources.map((src, idx) => {
                      const meta = SOURCE_ICONS[src.type] ?? SOURCE_ICONS.text
                      return (
                        <div key={idx} className={cn("flex items-center gap-2.5 p-2.5 rounded-lg border", meta.bg)}>
                          {meta.icon}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{src.title}</p>
                            {src.url && <p className="text-[10px] text-muted-foreground truncate">{src.url}</p>}
                          </div>
                          {(src.wordCount ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground shrink-0">~{src.wordCount} слов</span>
                          )}
                          <button type="button" onClick={() => removeSource(idx)} className="p-0.5 hover:text-destructive transition-colors shrink-0">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {sources.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Добавьте источники для генерации курса
                  </div>
                )}
              </div>
            </div>

            {/* ═══ RIGHT — Settings / Generation / Result (col-span-3) ═══ */}
            <div className="col-span-3 overflow-auto">
              {/* STATE 1: Settings (before generation or when no result) */}
              {!generating && !result && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold">Настройки генерации</h2>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Описание</Label>
                    <Textarea
                      placeholder="Опишите цель курса (необязательно)"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Целевая аудитория</Label>
                      <Select value={audience} onValueChange={setAudience}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Тон</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Формат</Label>
                    <Select value={format} onValueChange={setFormat}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FORMAT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="withTests" checked={withTests} onCheckedChange={(v) => setWithTests(v === true)} />
                      <Label htmlFor="withTests" className="font-normal cursor-pointer text-sm">Генерировать тесты</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="withSummary" checked={withSummary} onCheckedChange={(v) => setWithSummary(v === true)} />
                      <Label htmlFor="withSummary" className="font-normal cursor-pointer text-sm">Генерировать конспект</Label>
                    </div>
                  </div>

                  {/* Estimation */}
                  {sources.length > 0 && (
                    <div className="p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Coins className="size-3.5" />
                        <span className="font-medium text-foreground">Оценка</span>
                      </div>
                      <p>Объём материалов: ~{totalWords.toLocaleString()} слов → ~{estimatedTokens.toLocaleString()} токенов input</p>
                      <p>Примерная стоимость: ${estimatedCost}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1 gap-2" disabled={sources.length === 0 || generating} onClick={handleGenerate}>
                      <Sparkles className="size-4" />
                      Сгенерировать курс
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={handleSave} disabled={saving}>
                      <Save className="size-4" />
                      Сохранить
                    </Button>
                  </div>
                </div>
              )}

              {/* Keyframes — always mounted so STATE 3 popIn works after generating unmounts */}
              <style dangerouslySetInnerHTML={{
                __html: `
                  @keyframes stageFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes popIn {
                    0%   { transform: scale(0.5); opacity: 0; }
                    60%  { transform: scale(1.15); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                  }
                `,
              }} />

              {/* STATE 2: Generating — staged animation */}
              {generating && (
                <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-6">
                  <div className="text-center space-y-2">
                    <div className="relative inline-block">
                      <Sparkles className="size-12 text-violet-500 mx-auto animate-pulse" />
                      <div className="absolute inset-0 size-12 rounded-full bg-violet-500/20 animate-ping" />
                    </div>
                    <p className="font-semibold text-lg">AI генерирует курс</p>
                  </div>

                  {/* Staged checklist */}
                  <div className="w-full max-w-md space-y-2">
                    {PROGRESS_STAGE_DATA.map((stage, i) => {
                      const StageIcon = stage.icon
                      const isDone = i < genStage
                      const isActive = i === genStage
                      const isPending = i > genStage
                      return (
                        <div
                          key={stage.label}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all",
                            isDone && "border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/10",
                            isActive && "border-violet-300 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-900/10",
                            isPending && "border-border bg-muted/20 opacity-50",
                          )}
                          style={
                            isActive
                              ? { animation: "stageFadeIn 400ms ease-out both" }
                              : undefined
                          }
                        >
                          <div
                            className={cn(
                              "shrink-0 size-8 rounded-full flex items-center justify-center",
                              isDone && "bg-emerald-500 text-white",
                              isActive && "bg-violet-500 text-white",
                              isPending && "bg-muted text-muted-foreground",
                            )}
                          >
                            {isDone ? (
                              <CheckCircle2 className="size-4" />
                            ) : isActive ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <StageIcon className="size-4" />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm flex-1",
                              isDone && "text-emerald-800 dark:text-emerald-300",
                              isActive && "font-semibold text-foreground",
                              isPending && "text-muted-foreground",
                            )}
                          >
                            {stage.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="w-full max-w-md">
                    <div className="h-2 rounded-full bg-violet-100 dark:bg-violet-900/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-1000 ease-out"
                        style={{ width: `${genProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Это займёт 15-30 секунд
                    </p>
                  </div>
                </div>
              )}

              {/* STATE 2b: Just finished — success celebration flash */}
              {!generating && result && !genError && (
                <div
                  className="hidden"
                  aria-hidden
                  // Используется как marker; реальная success-ячейка ниже в STATE 3
                />
              )}

              {/* STATE 3: Result */}
              {!generating && result && (
                <div className="p-6 space-y-5">
                  <div
                    className="rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 dark:border-emerald-900/50 p-5 text-center"
                    style={{ animation: "popIn 500ms ease-out both" }}
                  >
                    <div className="inline-flex size-12 rounded-full bg-emerald-500 text-white items-center justify-center mb-2">
                      <CheckCircle2 className="size-7" />
                    </div>
                    <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-200 inline-flex items-center gap-2 justify-center">
                      <PartyPopper className="size-5" />
                      Курс готов!
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                      Проверьте результат и опубликуйте в раздел «Обучение»
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      Курс сгенерирован
                    </h2>
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { setResult(null); handleGenerate() }}>
                      <RefreshCw className="size-3.5" />
                      Перегенерировать
                    </Button>
                  </div>

                  {/* Editable title/desc */}
                  <div className="p-4 rounded-xl border bg-card space-y-3">
                    <Input
                      value={result.title}
                      onChange={(e) => setResult({ ...result, title: e.target.value })}
                      className="text-lg font-semibold border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                    />
                    <Textarea
                      value={result.description}
                      onChange={(e) => setResult({ ...result, description: e.target.value })}
                      rows={2}
                      className="text-sm border-0 bg-transparent p-0 focus-visible:ring-0 resize-none"
                    />
                  </div>

                  {/* Course tree */}
                  <div className="space-y-2">
                    {result.modules.map((mod, mi) => (
                      <div key={mi} className="border rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-muted/30 flex items-center gap-2">
                          <FolderOpen className="size-4 text-violet-500" />
                          <span className="text-sm font-semibold">{mod.title}</span>
                          <Badge variant="secondary" className="text-[10px] ml-auto">{mod.lessons.length} уроков</Badge>
                        </div>
                        <div className="divide-y">
                          {mod.lessons.map((lesson, li) => (
                            <Collapsible key={li}>
                              <CollapsibleTrigger asChild>
                                <button type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
                                  <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{li + 1}</span>
                                  <FileText className="size-3.5 text-muted-foreground shrink-0" />
                                  <span className="flex-1 text-sm truncate">{lesson.title}</span>
                                  <Badge variant="outline" className="text-[10px] shrink-0">{lesson.duration_minutes} мин</Badge>
                                  {lesson.test && <Badge variant="secondary" className="text-[10px] shrink-0">Тест</Badge>}
                                  <ChevronDown className="size-3.5 text-muted-foreground" />
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="px-4 pb-4 pt-1 ml-8 space-y-3">
                                  <div className="prose prose-sm max-w-none text-sm text-muted-foreground">
                                    <div dangerouslySetInnerHTML={{ __html: lesson.content_markdown
                                      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
                                      .replace(/^### (.+)$/gm, "<h4>$1</h4>")
                                      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                                      .replace(/^- (.+)$/gm, "<li>$1</li>")
                                      .replace(/\n/g, "<br>")
                                    }} />
                                  </div>
                                  {lesson.test && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-muted-foreground">Тестовые вопросы:</p>
                                      {lesson.test.questions.map((q, qi) => (
                                        <div key={qi} className="text-xs bg-muted/50 rounded p-2.5">
                                          <p className="font-medium text-foreground mb-1">{qi + 1}. {q.question}</p>
                                          <ul className="space-y-0.5">
                                            {q.options.map((opt, oi) => (
                                              <li key={oi} className={cn(oi === q.correct_index && "text-emerald-700 font-medium")}>
                                                {["А", "Б", "В", "Г"][oi]}. {opt}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Token stats */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Coins className="size-3.5" />
                    Использовано: {formatTokens(tokensInput)} input + {formatTokens(tokensOutput)} output токенов · ${costUsd}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setResult(null)}>Назад к настройкам</Button>
                    <Button variant="outline" className="gap-1.5" onClick={handleSave} disabled={saving}>
                      <Save className="size-4" />
                      Сохранить
                    </Button>
                    <Button className="flex-1 gap-2" onClick={handlePublish} disabled={publishing}>
                      {publishing ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                      Опубликовать в Курсы
                    </Button>
                  </div>

                  {genError && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="size-4" />
                      {genError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Article picker */}
      <Dialog open={showArticlePicker} onOpenChange={setShowArticlePicker}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Выбрать статьи из базы знаний</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Поиск..." value={articleSearch} onChange={(e) => setArticleSearch(e.target.value)} className="pl-10 h-10" />
          </div>
          <div className="flex-1 overflow-auto space-y-0.5 max-h-[400px]">
            {filteredArticles.map((a) => {
              const checked = selectedArticleIds.includes(a.id)
              return (
                <label key={a.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors", checked ? "bg-violet-50" : "hover:bg-muted/50")}>
                  <Checkbox checked={checked} onCheckedChange={(v) => {
                    if (v) setSelectedArticleIds((p) => [...p, a.id])
                    else setSelectedArticleIds((p) => p.filter((x) => x !== a.id))
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.category}</p>
                  </div>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Выбрано: {selectedArticleIds.length}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowArticlePicker(false)}>Отмена</Button>
              <Button onClick={handleConfirmArticles} disabled={selectedArticleIds.length === 0}>Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Text paste dialog */}
      <Dialog open={showTextDialog} onOpenChange={setShowTextDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить текст</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Вставьте текст из любого источника..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            className="text-sm"
          />
          {pasteText.trim() && (
            <p className="text-xs text-muted-foreground">{wordCount(pasteText)} слов</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTextDialog(false)}>Отмена</Button>
            <Button onClick={handleAddText} disabled={!pasteText.trim()}>Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
