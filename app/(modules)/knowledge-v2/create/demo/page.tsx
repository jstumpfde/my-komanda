"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ArrowRight, Upload, X, FileText, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS } from "@/lib/demo-types"
import type { DemoLength, DemoNiche } from "@/lib/demo-types"

// ─── Options ────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  "Продажи", "Маркетинг", "IT / разработка", "Логистика", "Производство",
  "Клиентский сервис", "HR", "Финансы", "Рабочие специальности", "Другое",
]

const MARKET_TYPES = ["B2B", "B2C", "B2G", "Внутренний"]

const LEVELS = ["Линейный", "Старший / ведущий", "Руководитель"]

type Path = "manual" | "library" | "document"

type LibraryTemplate = {
  id: string
  name: string
  niche: string
  length: string
  isSystem: boolean
  sections: unknown[]
}

const PATH_CARDS: { id: Path; emoji: string; title: string; desc: string }[] = [
  { id: "manual",   emoji: "📝", title: "С нуля",        desc: "Заполнить параметры вручную" },
  { id: "library",  emoji: "📚", title: "Из библиотеки", desc: "Выбрать готовый шаблон" },
  { id: "document", emoji: "📄", title: "Из документа",  desc: "Загрузить DOCX, PDF или TXT" },
]

const DEFAULT_BLOCK_FIELDS = {
  imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
  videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
  audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
  fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
  infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
  buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary", buttonColor: "", buttonIconBefore: "", buttonIconAfter: "",
  taskTitle: "", taskDescription: "", questions: [],
}

// ─── Claude client-side helpers ────────────────────────────────────────────

interface ClaudeLesson {
  name?: string
  title?: string
  emoji?: string
  content?: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function contentToHtml(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim()
  if (!normalized) return ""

  const inlineFormat = (raw: string): string => {
    let s = escapeHtml(raw)
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    return s
  }

  // Inline styles survive Tailwind preflight (which resets <p> margins to 0),
  // so paragraph spacing shows up regardless of the editor's CSS context.
  const pStyle = 'style="margin:0 0 12px 0;line-height:1.55"'
  const ulStyle = 'style="margin:0 0 12px 0;padding-left:22px"'

  // Split into paragraphs by one or more blank lines.
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return `<p ${pStyle}>${escapeHtml(normalized)}</p>`

  const out: string[] = []
  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const allBullets = lines.every((l) => /^[•\-\*]\s+/.test(l))
    if (allBullets) {
      const items = lines
        .map((l) => l.replace(/^[•\-\*]\s+/, ""))
        .map((l) => `<li>${inlineFormat(l)}</li>`)
        .join("")
      out.push(`<ul ${ulStyle}>${items}</ul>`)
      continue
    }

    // Regular paragraph: single newlines become <br/>.
    out.push(`<p ${pStyle}>${lines.map(inlineFormat).join("<br/>")}</p>`)
  }

  return out.join("") || `<p ${pStyle}>${escapeHtml(normalized)}</p>`
}

// ─── Marker parsing ([ТЕСТ] / [ЗАДАНИЕ]) ────────────────────────────────────

interface ParsedBlock {
  type: "text" | "task"
  content: string
  taskTitle: string
  taskDescription: string
  questions: Array<{
    id: string
    text: string
    answerType: "single" | "long" | "video"
    options: string[]
    correctOptions?: number[]
    required: boolean
  }>
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parseTestMarker(body: string): ParsedBlock["questions"][number] | null {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let questionText = ""
  const letters: string[] = []
  const options: string[] = []
  let correctLetter = ""

  for (const line of lines) {
    const q = line.match(/^Вопрос\s*:\s*(.+)$/i)
    if (q) { questionText = q[1].trim(); continue }
    const opt = line.match(/^([A-ZА-ЯЁ])[\)\.\s]\s*(.+)$/)
    if (opt) { letters.push(opt[1].toUpperCase()); options.push(opt[2].trim()); continue }
    const correct = line.match(/^Правильный\s*:\s*([A-ZА-ЯЁ])/i)
    if (correct) { correctLetter = correct[1].toUpperCase(); continue }
  }

  if (!questionText || options.length === 0) return null

  const correctIdx = letters.indexOf(correctLetter)
  return {
    id: randomId("q"),
    text: questionText,
    answerType: "single",
    options,
    correctOptions: correctIdx >= 0 ? [correctIdx] : [],
    required: false,
  }
}

function parseTaskMarker(body: string): { title: string; description: string; taskType: "text" | "video" } {
  const lines = body.split(/\r?\n/).map((l) => l.trim())
  let title = ""
  const descriptionParts: string[] = []
  let taskType: "text" | "video" = "text"
  let inDescription = false

  for (const line of lines) {
    if (!line) { if (inDescription) descriptionParts.push(""); continue }
    const t = line.match(/^Название\s*:\s*(.+)$/i)
    if (t) { title = t[1].trim(); inDescription = false; continue }
    const d = line.match(/^Описание\s*:\s*(.+)$/i)
    if (d) { descriptionParts.push(d[1].trim()); inDescription = true; continue }
    const k = line.match(/^Тип\s*:\s*(.+)$/i)
    if (k) {
      const value = k[1].trim().toLowerCase()
      taskType = value.includes("видео") || value.includes("video") ? "video" : "text"
      inDescription = false
      continue
    }
    if (inDescription) descriptionParts.push(line)
  }

  return {
    title,
    description: descriptionParts.join("\n").trim(),
    taskType,
  }
}

function parseLessonContent(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  const markerRegex = /\[(ТЕСТ|ЗАДАНИЕ)\]([\s\S]*?)\[\/\1\]/g
  let lastIdx = 0
  let match: RegExpExecArray | null

  const pushText = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    blocks.push({
      type: "text",
      content: contentToHtml(trimmed),
      taskTitle: "",
      taskDescription: "",
      questions: [],
    })
  }

  while ((match = markerRegex.exec(content)) !== null) {
    pushText(content.substring(lastIdx, match.index))

    const markerType = match[1]
    const body = match[2]

    if (markerType === "ТЕСТ") {
      const question = parseTestMarker(body)
      if (question) {
        blocks.push({
          type: "task",
          content: "",
          taskTitle: "Проверка понимания",
          taskDescription: "",
          questions: [question],
        })
      } else {
        // Malformed test — keep the raw text so nothing is silently lost.
        pushText(body)
      }
    } else {
      const parsed = parseTaskMarker(body)
      if (parsed.title || parsed.description) {
        blocks.push({
          type: "task",
          content: "",
          taskTitle: parsed.title || "Задание",
          taskDescription: "",
          questions: [{
            id: randomId("q"),
            text: parsed.description,
            answerType: parsed.taskType === "video" ? "video" : "long",
            options: [],
            required: false,
          }],
        })
      } else {
        pushText(body)
      }
    }

    lastIdx = match.index + match[0].length
  }

  pushText(content.substring(lastIdx))

  // An empty lesson still needs at least one empty text block so the editor
  // shows a placeholder instead of collapsing the lesson entirely.
  if (blocks.length === 0) {
    blocks.push({
      type: "text",
      content: "",
      taskTitle: "",
      taskDescription: "",
      questions: [],
    })
  }

  return blocks
}

function tryParseJsonArray(raw: string): ClaudeLesson[] | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()

  // 1. Try parsing as-is
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* fall through */
  }

  // 2. Truncated output: close the array after the last complete object
  const lastBrace = cleaned.lastIndexOf("}")
  if (lastBrace > 0) {
    try {
      const parsed = JSON.parse(cleaned.substring(0, lastBrace + 1) + "]")
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* fall through */
    }
  }

  // 3. Regex fallback: grab the first [...] block
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed
    } catch {
      return null
    }
  }

  return null
}

type Tone = "energetic" | "friendly" | "business" | "direct"

const TONE_META: Record<Tone, { label: string; emoji: string; description: string }> = {
  energetic: { label: "Энергичный",  emoji: "🔥", description: "вызов и драйв" },
  friendly:  { label: "Дружелюбный", emoji: "🤝", description: "тёплый и поддерживающий" },
  business:  { label: "Деловой",     emoji: "💼", description: "факты без эмоций" },
  direct:    { label: "Прямой",      emoji: "🎯", description: "только суть" },
}

const LENGTH_HINT: Record<DemoLength, string> = {
  short:    "короткая ~6 уроков",
  standard: "стандартная ~15 уроков",
  full:     "полная ~22 урока",
}

type WorkFormatKey = "office" | "hybrid" | "remote"

const WORK_FORMATS: { key: WorkFormatKey; label: string; emoji: string }[] = [
  { key: "office", label: "Офис",     emoji: "🏢" },
  { key: "hybrid", label: "Гибрид",   emoji: "🔄" },
  { key: "remote", label: "Удалёнка", emoji: "🏠" },
]

const WORK_FORMAT_LABEL: Record<WorkFormatKey, string> = WORK_FORMATS.reduce(
  (acc, f) => { acc[f.key] = f.label; return acc },
  {} as Record<WorkFormatKey, string>,
)

type Market = "B2B" | "B2C" | "B2G"

const MARKETS: Market[] = ["B2B", "B2C", "B2G"]

interface PromptParams {
  length: DemoLength
  tone: Tone
  market: Market[]
  company: string
  position: string
  city: string
  salary: string
  workFormat: WorkFormatKey[]
  hiringManager: string
  ceoName: string
}

function buildPrompt(text: string, params: PromptParams): string {
  const tone = TONE_META[params.tone]
  const lengthLabel = LENGTH_HINT[params.length]

  const withVar = (value: string, variable: string) =>
    value.trim() ? value.trim() : `не указана, используй {{${variable}}}`
  const plain = (value: string) => (value.trim() ? value.trim() : "не указан")

  const company = withVar(params.company, "компания")
  const position = withVar(params.position, "должность")
  const city = withVar(params.city, "город")
  const salary = params.salary.trim() ? params.salary.trim() : "не указана, используй {{зарплата}}"
  const workFormat = params.workFormat.length > 0
    ? params.workFormat.map((k) => WORK_FORMAT_LABEL[k]).join(", ")
    : "не указан"
  const hiringManager = plain(params.hiringManager)
  const ceoName = plain(params.ceoName)

  return `Ты — эксперт по созданию обучающих демонстраций должности для кандидатов.

Разбей следующий документ на уроки (разделы) для демонстрации должности.

Параметры демонстрации:
- Формат: ${lengthLabel}
- Тон: ${tone.label.toLowerCase()} — ${tone.description}
- Тип рынка: ${(params.market.length > 0 ? params.market : ["B2B"]).join(", ")}
- Компания: ${company}
- Должность: ${position}
- Город: ${city}
- Зарплата: ${salary}
- Формат работы: ${workFormat}
- Кто набирает: ${hiringManager}
- Основатель/Генеральный директор: ${ceoName}

Где данные не указаны — используй переменные в двойных фигурных скобках: {{компания}}, {{должность}}, {{город}}, {{зарплата}}, {{имя}}.
Где данные указаны — подставь реальные значения.
{{имя}} всегда оставляй как переменную — она подставится при отправке кандидату.

Правила:
- Сохрани ВЕСЬ контент из документа. Ничего не сокращай, не пропускай, не перефразируй.
- Если текст длинный — это нормально. Лучше длинный полный урок чем короткий обрезанный.
- Каждый логический раздел документа = отдельный урок
- Название урока: краткое, 3-5 слов, с подходящим эмодзи в начале
- Сохрани форматирование: абзацы (разделяй пустой строкой), списки (• ), жирный (**текст**)
- Если есть упоминание видео — вставь placeholder: [ВИДЕО: описание]
- Если указан формат работы, зарплата, кто набирает — используй в соответствующих местах
- Если указан основатель — в уроке "Видео-обращение" используй его имя
- Если указан кто набирает — используй в приветствии и финале
- {{имя}} ВСЕГДА оставляй как переменную
- Последний урок ОБЯЗАТЕЛЬНО: финал с инструкцией что делать дальше (видео-визитка, следующий шаг)
- Соблюдай выбранный тон коммуникации ВО ВСЕХ уроках
- АБЗАЦЫ: Разделяй текст на абзацы пустой строкой (\\n\\n) каждые 2-3 предложения. Никогда не пиши стену текста.
- ТЕСТЫ: В уроках "Проверка понимания" создавай тестовые вопросы. Формат теста в content:
  [ТЕСТ]
  Вопрос: текст вопроса?
  A) вариант 1
  B) вариант 2
  C) вариант 3
  Правильный: B
  [/ТЕСТ]
  Создай 3-5 вопросов на понимание роли и компании на основе материала демонстрации.
- ЗАДАНИЯ: В уроках где кандидат должен ответить или записать видео, используй формат:
  [ЗАДАНИЕ]
  Название: Опыт в продажах
  Описание: Опиши конкретно: в каких ролях работал, с какими продуктами, сколько лет в продажах.
  Тип: текст
  [/ЗАДАНИЕ]
  Создай 2-3 задания для самопрезентации кандидата.
- ВИДЕО-ВИЗИТКА: Последний или предпоследний урок. Кандидат записывает видео 1-2 минуты. Формат:
  [ЗАДАНИЕ]
  Название: Видео-визитка
  Описание: Запиши видео 1-2 минуты. Расскажи почему хочешь работать в {{компания}}, свои сильные стороны для этой роли и почему подходишь лучше других.
  Тип: видео
  [/ЗАДАНИЕ]

Верни ТОЛЬКО JSON массив без markdown backticks:
[
  {
    "name": "👋 Приветствие",
    "emoji": "👋",
    "content": "Текст урока с форматированием..."
  }
]

Документ:
${text}`
}

interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
}

interface ClaudeResult {
  lessons: ClaudeLesson[]
  usage: ClaudeUsage
}

const CLAUDE_MODEL = "claude-sonnet-4-20250514"

async function callClaudeFromBrowser(
  text: string,
  apiKey: string,
  params: PromptParams,
  signal?: AbortSignal,
): Promise<ClaudeResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16384,
      messages: [{ role: "user", content: buildPrompt(text, params) }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error("[claude] error", res.status, body)
    throw new Error("Claude API вернул ошибку")
  }

  const data = await res.json() as {
    content?: { type: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const textContent = data.content?.find((c) => c.type === "text")?.text ?? ""
  if (!textContent) throw new Error("Пустой ответ от Claude API")

  const lessons = tryParseJsonArray(textContent)
  if (!lessons || lessons.length === 0) {
    console.error("[claude] unparseable", textContent.slice(0, 500))
    throw new Error("Не удалось распарсить ответ Claude")
  }

  return {
    lessons,
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
    },
  }
}

// ─── Pill component ─────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 px-4 rounded-full text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-background border border-border text-foreground hover:border-primary/50",
      )}
    >
      {label}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{children}</p>
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CreateDemoPage() {
  const router = useRouter()

  const [path, setPath] = useState<Path | null>(null)

  // ── Manual fields ──
  const [demoName, setDemoName] = useState("")
  const [department, setDepartment] = useState<string | null>(null)
  const [marketType, setMarketType] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)
  const [selectedLength, setSelectedLength] = useState<DemoLength>("standard")

  // ── Library fields ──
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [libDepartment, setLibDepartment] = useState("")
  const [libMarket, setLibMarket] = useState("")
  const [libSearch, setLibSearch] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // ── Document fields ──
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docLength, setDocLength] = useState<DemoLength>("standard")
  const [docTone, setDocTone] = useState<Tone>("friendly")
  const [docMarket, setDocMarket] = useState<Market[]>(["B2B"])

  const toggleDocMarket = (m: Market) => {
    setDocMarket((prev) => {
      if (prev.includes(m)) {
        // Keep at least one market selected
        return prev.length === 1 ? prev : prev.filter((x) => x !== m)
      }
      return [...prev, m]
    })
  }
  const [docCompany, setDocCompany] = useState("")
  const [docPosition, setDocPosition] = useState("")
  const [docCity, setDocCity] = useState("")
  const [docSalary, setDocSalary] = useState("")
  const [docWorkFormat, setDocWorkFormat] = useState<WorkFormatKey[]>([])

  const toggleDocWorkFormat = (k: WorkFormatKey) => {
    setDocWorkFormat((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    )
  }
  const [docHiringManager, setDocHiringManager] = useState("")
  const [docCeoName, setDocCeoName] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  // ── Submission state ──
  const [submitting, setSubmitting] = useState(false)
  const [submitStage, setSubmitStage] = useState("")

  const lengthKeys = Object.keys(LENGTH_LABELS) as DemoLength[]

  // Load templates lazily when entering the library path
  useEffect(() => {
    if (path !== "library" || templates !== null || templatesLoading) return
    setTemplatesLoading(true)
    fetch("/api/demo-templates")
      .then((r) => r.json())
      .then((d) => {
        const list: LibraryTemplate[] = Array.isArray(d) ? d : (d.data ?? [])
        setTemplates(list)
        setTemplatesLoading(false)
      })
      .catch(() => {
        toast.error("Не удалось загрузить шаблоны")
        setTemplates([])
        setTemplatesLoading(false)
      })
  }, [path, templates, templatesLoading])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleFileSelect = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["docx", "pdf", "txt", "md"].includes(ext || "")) {
      toast.error("Поддерживаются: DOCX, PDF, TXT, MD")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл слишком большой. Максимум 10 МБ")
      return
    }
    setUploadedFile(file)
  }

  const handleCreateManual = () => {
    const name = demoName.trim()
    if (name.length < 3) return
    const params = new URLSearchParams({
      length: selectedLength,
      ...(department ? { department } : {}),
      ...(marketType ? { market: marketType } : {}),
      ...(level ? { level } : {}),
      name,
    })
    router.push(`/knowledge-v2/editor?${params.toString()}`)
  }

  const handleUseTemplate = async () => {
    if (!selectedTemplateId || !templates) return
    const tmpl = templates.find((t) => t.id === selectedTemplateId)
    if (!tmpl) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/demo-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${tmpl.name} (копия)`.slice(0, 76),
          niche: tmpl.niche,
          length: tmpl.length,
          sections: tmpl.sections,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Ошибка создания")
        setSubmitting(false)
        return
      }
      const id = (data.data ?? data).id
      toast.success("Шаблон скопирован")
      router.push(`/knowledge-v2/editor?id=${id}`)
    } catch {
      toast.error("Ошибка сети")
      setSubmitting(false)
    }
  }

  const handleCreateFromDocument = async () => {
    if (!uploadedFile) return

    const controller = new AbortController()
    abortRef.current = controller
    const signal = controller.signal

    const isAbort = (err: unknown) =>
      signal.aborted ||
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError")

    setSubmitting(true)
    try {
      // ── Step 1: extract text on the server ──
      setSubmitStage("Извлекаем текст из документа...")
      const formData = new FormData()
      formData.append("file", uploadedFile)
      const parseRes = await fetch("/api/demo-templates/parse-document", { method: "POST", body: formData, signal })
      const parseData = await parseRes.json()
      if (!parseRes.ok) {
        toast.error(parseData.error || "Ошибка извлечения текста")
        setSubmitting(false)
        setSubmitStage("")
        return
      }
      const extractedText: string = parseData.text
      if (!extractedText) {
        toast.error("Документ пустой")
        setSubmitting(false)
        setSubmitStage("")
        return
      }

      // ── Step 2: fetch API key, call Claude from the browser ──
      setSubmitStage("Разбиваем документ на уроки...")
      const keyRes = await fetch("/api/ai/key", { signal })
      const keyData = await keyRes.json()
      if (!keyRes.ok || !keyData.key) {
        toast.error(keyData.error || "API ключ недоступен")
        setSubmitting(false)
        setSubmitStage("")
        return
      }

      let claudeResult: ClaudeResult
      try {
        claudeResult = await callClaudeFromBrowser(
          extractedText,
          keyData.key,
          {
            length: docLength,
            tone: docTone,
            market: docMarket,
            company: docCompany,
            position: docPosition,
            city: docCity,
            salary: docSalary,
            workFormat: docWorkFormat,
            hiringManager: docHiringManager,
            ceoName: docCeoName,
          },
          signal,
        )
      } catch (err) {
        if (isAbort(err)) return
        const message = err instanceof Error ? err.message : "Ошибка Claude API"
        toast.error(message)
        setSubmitting(false)
        setSubmitStage("")
        return
      }
      const { lessons: claudeLessons, usage } = claudeResult

      // Fire-and-forget usage log — don't block UX if it fails
      void fetch("/api/ai/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "document_parse",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          model: CLAUDE_MODEL,
        }),
      }).catch((err) => console.error("[ai/log]", err))

      // ── Step 3: transform Claude output into editor sections ──
      const sections = claudeLessons
        .map((lesson, i) => {
          const rawTitle = (lesson.name || lesson.title || "").trim()
          const emoji = (lesson.emoji || "").trim() || "📄"
          const title = rawTitle.replace(/^\p{Extended_Pictographic}+\s*/u, "").trim() || "Раздел"
          const content = (lesson.content || "").trim()
          const parsedBlocks = content ? parseLessonContent(content) : []
          return {
            id: `lesson-${Date.now()}-${i}`,
            emoji,
            title,
            blocks: parsedBlocks.map((b, j) => ({
              ...DEFAULT_BLOCK_FIELDS,
              id: `blk-${Date.now()}-${i}-${j}`,
              type: b.type,
              content: b.content,
              taskTitle: b.taskTitle,
              taskDescription: b.taskDescription,
              questions: b.questions,
            })),
          }
        })
        .filter((l) => l.title || l.blocks.length > 0)

      if (sections.length === 0) {
        toast.error("Claude не вернул уроки")
        setSubmitting(false)
        setSubmitStage("")
        return
      }

      // ── Step 4: persist and redirect to editor ──
      setSubmitStage("Сохраняем демонстрацию...")
      const baseName = (parseData.filename || uploadedFile.name).replace(/\.[^.]+$/, "").trim().slice(0, 76) || "Демонстрация"
      const createRes = await fetch("/api/demo-templates", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: baseName,
          niche: "universal",
          length: docLength,
          sections,
        }),
      })
      const created = await createRes.json()
      if (!createRes.ok) {
        toast.error(created.error || "Ошибка создания")
        setSubmitting(false)
        setSubmitStage("")
        return
      }
      const id = (created.data ?? created).id
      const totalTokens = usage.input_tokens + usage.output_tokens
      toast.success(`Документ разбит на ${sections.length} уроков. Использовано: ${totalTokens.toLocaleString("ru-RU")} токенов`)
      router.push(`/knowledge-v2/editor?id=${id}`)
    } catch (err) {
      if (isAbort(err)) return
      toast.error("Ошибка сети")
      setSubmitting(false)
      setSubmitStage("")
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const handleCancelSubmission = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setSubmitStage("")
    setSubmitting(false)
    toast.info("Создание отменено")
  }

  // ─── Filtered library list ───────────────────────────────────────────────

  const filteredTemplates = (templates ?? []).filter((t) => {
    if (libDepartment && t.niche !== libDepartment) return false
    if (libMarket) {
      const haystack = t.name.toLowerCase()
      if (!haystack.includes(libMarket.toLowerCase())) return false
    }
    if (libSearch) {
      const q = libSearch.toLowerCase()
      if (!t.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Header */}
              <div>
                <h1 className="text-xl font-semibold">Новая демонстрация</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Выберите способ создания</p>
              </div>

              {/* ═══ Path cards ═══ */}
              <div className="grid grid-cols-3 gap-4">
                {PATH_CARDS.map((card) => {
                  const active = path === card.id
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setPath(card.id)}
                      className={cn(
                        "h-32 rounded-xl p-6 cursor-pointer text-center transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                        active
                          ? "border-2 border-primary bg-primary/5 shadow-sm"
                          : "border border-border hover:border-primary/50",
                      )}
                    >
                      <div className="text-[32px] leading-none">{card.emoji}</div>
                      <div className="text-base font-bold">{card.title}</div>
                      <div className="text-sm text-muted-foreground">{card.desc}</div>
                    </button>
                  )
                })}
              </div>

              {/* ═══ Manual path ═══ */}
              {path === "manual" && (
                <div className="space-y-6">
                  <div>
                    <SectionLabel>Название демонстрации *</SectionLabel>
                    <Input
                      value={demoName}
                      onChange={(e) => setDemoName(e.target.value)}
                      maxLength={76}
                      placeholder="Например: Менеджер по продажам B2B — Компания"
                      className="h-10 bg-[var(--input-bg)]"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Обязательное поле, минимум 3 символа</p>
                  </div>

                  <div>
                    <SectionLabel>Отдел</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {DEPARTMENTS.map((d) => (
                        <Pill key={d} label={d} active={department === d} onClick={() => setDepartment(department === d ? null : d)} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Тип рынка</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {MARKET_TYPES.map((m) => (
                        <Pill key={m} label={m} active={marketType === m} onClick={() => setMarketType(marketType === m ? null : m)} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Уровень</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {LEVELS.map((l) => (
                        <Pill key={l} label={l} active={level === l} onClick={() => setLevel(level === l ? null : l)} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Формат</SectionLabel>
                    <div className="grid grid-cols-3 gap-3">
                      {lengthKeys.map((key) => {
                        const l = LENGTH_LABELS[key]
                        const active = selectedLength === key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedLength(key)}
                            className={cn(
                              "rounded-lg p-4 text-left cursor-pointer transition-all duration-200 h-[72px] flex flex-col justify-center",
                              active
                                ? "border-2 border-primary bg-primary/5 shadow-sm"
                                : "border border-border hover:border-primary/50",
                            )}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-base leading-none">{l.emoji}</span>
                              <span className="text-sm font-semibold">{l.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{l.time} · {l.subblocks} блоков</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 pb-4">
                    <Button
                      onClick={handleCreateManual}
                      disabled={demoName.trim().length < 3}
                      className="h-10 px-6 gap-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Создать демонстрацию
                    </Button>
                  </div>
                </div>
              )}

              {/* ═══ Library path ═══ */}
              {path === "library" && (
                <div className="space-y-6">
                  {/* Filters row */}
                  <div className="grid grid-cols-3 gap-3">
                    <select
                      value={libDepartment}
                      onChange={(e) => setLibDepartment(e.target.value)}
                      className="h-10 px-3 rounded-md border border-border bg-background text-sm"
                    >
                      <option value="">Все отделы</option>
                      {Object.entries(NICHE_LABELS).map(([key, meta]) => (
                        <option key={key} value={key}>{meta.emoji} {meta.label}</option>
                      ))}
                    </select>
                    <select
                      value={libMarket}
                      onChange={(e) => setLibMarket(e.target.value)}
                      className="h-10 px-3 rounded-md border border-border bg-background text-sm"
                    >
                      <option value="">Все рынки</option>
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="B2G">B2G</option>
                    </select>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={libSearch}
                        onChange={(e) => setLibSearch(e.target.value)}
                        placeholder="Поиск шаблонов..."
                        className="h-10 pl-9 bg-[var(--input-bg)]"
                      />
                    </div>
                  </div>

                  {/* Templates list */}
                  {templatesLoading ? (
                    <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />Загрузка шаблонов...
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                      Шаблоны не найдены
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {filteredTemplates.map((t) => {
                        const niche = NICHE_LABELS[t.niche as DemoNiche]
                        const lengthMeta = LENGTH_LABELS[t.length as DemoLength]
                        const lessonsCount = Array.isArray(t.sections) ? t.sections.length : 0
                        const active = selectedTemplateId === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedTemplateId(t.id)}
                            className={cn(
                              "rounded-lg p-4 text-left cursor-pointer transition-all duration-200 flex items-start gap-3",
                              active
                                ? "border-2 border-primary bg-primary/5 shadow-sm"
                                : "border border-border hover:border-primary/50",
                            )}
                          >
                            <div className="text-2xl leading-none shrink-0">{niche?.emoji ?? "⚡"}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">{t.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {lengthMeta?.label ?? t.length} · {lessonsCount} {lessonsCount === 1 ? "урок" : "уроков"}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex justify-end pt-2 pb-4">
                    <Button
                      onClick={handleUseTemplate}
                      disabled={!selectedTemplateId || submitting}
                      className="h-10 px-6 gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      {submitting ? "Создание..." : "Использовать шаблон"}
                    </Button>
                  </div>
                </div>
              )}

              {/* ═══ Document path ═══ */}
              {path === "document" && (
                <div className="space-y-6">
                  {/* Format selector */}
                  <div>
                    <SectionLabel>Формат</SectionLabel>
                    <div className="grid grid-cols-3 gap-3">
                      {lengthKeys.map((key) => {
                        const l = LENGTH_LABELS[key]
                        const active = docLength === key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setDocLength(key)}
                            className={cn(
                              "rounded-lg p-4 text-left cursor-pointer transition-all duration-200 h-[72px] flex flex-col justify-center",
                              active
                                ? "border-2 border-primary bg-primary/5 shadow-sm"
                                : "border border-border hover:border-primary/50",
                            )}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-base leading-none">{l.emoji}</span>
                              <span className="text-sm font-semibold">{l.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{l.time} · {l.subblocks} блоков</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Tone selector */}
                  <div>
                    <SectionLabel>Тон</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(TONE_META) as Tone[]).map((key) => {
                        const t = TONE_META[key]
                        return (
                          <Pill
                            key={key}
                            label={`${t.emoji} ${t.label}`}
                            active={docTone === key}
                            onClick={() => setDocTone(key)}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Market selector */}
                  <div>
                    <SectionLabel>Тип рынка</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {MARKETS.map((m) => (
                        <Pill
                          key={m}
                          label={m}
                          active={docMarket.includes(m)}
                          onClick={() => toggleDocMarket(m)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Work format selector */}
                  <div>
                    <SectionLabel>Формат работы</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {WORK_FORMATS.map((f) => (
                        <Pill
                          key={f.key}
                          label={`${f.emoji} ${f.label}`}
                          active={docWorkFormat.includes(f.key)}
                          onClick={() => toggleDocWorkFormat(f.key)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Company variables card */}
                  <div>
                    <SectionLabel>Данные компании</SectionLabel>
                    <div className="rounded-xl border border-border p-4">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Row 1 */}
                        <Input
                          value={docCompany}
                          onChange={(e) => setDocCompany(e.target.value)}
                          placeholder="Название компании"
                          className="h-10 bg-[var(--input-bg)]"
                        />
                        <Input
                          value={docPosition}
                          onChange={(e) => setDocPosition(e.target.value)}
                          placeholder="Менеджер по продажам"
                          className="h-10 bg-[var(--input-bg)]"
                        />

                        {/* Row 2 */}
                        <Input
                          value={docCity}
                          onChange={(e) => setDocCity(e.target.value)}
                          placeholder="Москва"
                          className="h-10 bg-[var(--input-bg)]"
                        />
                        <Input
                          value={docSalary}
                          onChange={(e) => setDocSalary(e.target.value)}
                          placeholder="от 200 000 ₽"
                          className="h-10 bg-[var(--input-bg)]"
                        />

                        {/* Row 3 */}
                        <Input
                          value={docHiringManager}
                          onChange={(e) => setDocHiringManager(e.target.value)}
                          placeholder="Иван Петров, руководитель отдела продаж"
                          className="h-10 bg-[var(--input-bg)]"
                        />

                        {/* Row 4 */}
                        <Input
                          value={docCeoName}
                          onChange={(e) => setDocCeoName(e.target.value)}
                          placeholder="Основатель / Ген. директор"
                          className="h-10 bg-[var(--input-bg)]"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Заполненные поля будут подставлены в демонстрацию</p>
                    </div>
                  </div>

                  {uploadedFile ? (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
                      <FileText className="w-7 h-7 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(0)} КБ</p>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        type="button"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files) }}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    >
                      <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
                      <p className="text-xs text-muted-foreground mt-1">Максимум 10 МБ · DOCX, PDF, TXT</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".docx,.pdf,.txt,.md"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2 pb-4">
                    {submitting ? (
                      <>
                        <Button disabled className="h-10 px-6 gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {submitStage || "Импорт документа..."}
                        </Button>
                        <Button variant="outline" onClick={handleCancelSubmission} className="h-10 px-6">
                          Отменить
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={handleCreateFromDocument}
                        disabled={!uploadedFile}
                        className="h-10 px-6 gap-2"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Создать из документа
                      </Button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
