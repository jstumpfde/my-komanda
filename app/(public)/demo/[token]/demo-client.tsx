"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { CheckCircle2, ChevronRight, Loader2, Video as VideoIcon, Mic, Camera, Square, RotateCcw, Send, Upload } from "lucide-react"
import type { Block, Lesson, Question } from "@/lib/course-types"
import { resolveBrand } from "@/lib/brand-colors"
import { VideoEmbed } from "@/components/blocks/VideoEmbed"
import { StoriesPlayer } from "@/components/vacancies/stories-player"
import { PdfSlidesViewer } from "@/components/vacancies/pdf-slides-viewer"

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostDemoSettings {
  enabled?: boolean
  mode?: "auto" | "manual"
  upperThreshold?: number
  lowerThreshold?: number
  greenTitle?: string
  meetPhone?: boolean
  meetOnline?: boolean
  meetOffice?: boolean
  officeAddress?: string
  yellowTitle?: string
  yellowText?: string
  redTitle?: string
  redText?: string
  manualTitle?: string
  manualText?: string
  manualButton?: string
  manualButtonEnabled?: boolean
  greenButtonEnabled?: boolean
  formFields?: {
    firstName?: { enabled: boolean; required: boolean }
    lastName?: { enabled: boolean; required: boolean }
    email?: { enabled: boolean; required: boolean }
    phone?: { enabled: boolean; required: boolean }
    telegram?: { enabled: boolean; required: boolean }
    birthDate?: { enabled: boolean; required: boolean }
    city?: { enabled: boolean; required: boolean }
  }
  navButtonColor?: string
  navButtonText?: string
  // Системная нижняя панель «Назад/Завершить».
  // true = показывать всегда; false = скрыть всегда;
  // undefined (АВТО) = показывать только если уроков > 1.
  showSystemNav?: boolean
}

type FormFieldKey = "firstName" | "lastName" | "email" | "phone" | "telegram" | "birthDate" | "city"

const DEFAULT_FORM_FIELDS: Record<FormFieldKey, { enabled: boolean; required: boolean }> = {
  firstName: { enabled: true, required: true },
  lastName:  { enabled: true, required: true },
  email:     { enabled: true, required: true },
  phone:     { enabled: true, required: true },
  telegram:  { enabled: true, required: false },
  birthDate: { enabled: true, required: false },
  city:      { enabled: true, required: false },
}

function resolveFormField(settings: PostDemoSettings, key: FormFieldKey) {
  return settings.formFields?.[key] ?? DEFAULT_FORM_FIELDS[key]
}

// Валидация ISO YYYY-MM-DD (формат нативного <input type="date" />)
// с проверкой реальной даты и диапазона года.
function isValidBirthDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const year = +m[1], month = +m[2], day = +m[3]
  if (year < 1920 || year > 2010) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

// Валидация формата ДД.ММ.ГГГГ (для text input с маской)
function isValidBirthDateRu(s: string): boolean {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return false
  const day = +m[1], month = +m[2], year = +m[3]
  if (year < 1920 || year > 2010) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

// ДД.ММ.ГГГГ → YYYY-MM-DD (ISO)
function ruBirthToIso(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return ""
  return `${m[3]}-${m[2]}-${m[1]}`
}

// Применяет маску ДД.ММ.ГГГГ: оставляет только цифры, расставляет точки.
function maskBirthDateRu(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

interface DemoData {
  candidateName: string
  vacancyTitle: string
  companyName: string
  companyLogo: string | null
  brandPrimaryColor: string
  brandBgColor: string
  brandTextColor: string
  salaryMin: number | null
  salaryMax: number | null
  city: string | null
  format: string | null
  lessons: Lesson[]
  progress: {
    schemaVersion?: number
    currentBlock?: number
    totalBlocks?: number
    currentLesson?: number
    hasVideoVizitka?: boolean
    blocks?: { blockId: string; status: "completed" | "skipped"; timeSpent?: number; answeredAt?: string }[]
  } | null
  answers: { blockId: string; answer: any }[] | null
  // aiScore удалён — внутренняя оценка не передаётся кандидату (security S-5)
  postDemoSettings: PostDemoSettings
  // Ф5: текст-обёртка финальной анкеты, vacancies.description_json.anketaIntro.
  // Пустые поля или null → показываем дефолты.
  anketaIntro?: { title: string; description: string } | null
  // #16/#25: два редактируемых финальных экрана.
  finalScreens?: {
    afterVideo:  { title: string; subtitle: string; button: string }
    afterAnketa: { title: string; subtitle: string }
  } | null
  prefill?: { first_name: string | null; last_name: string | null; city: string | null }
  // F7: deep-link для Telegram — только если у компании подключён бот.
  candidateTelegramDeepLink?: string | null
  // F4: конфиг видео-интервью из vacancies.description_json.videoIntro.
  // null — блок не настроен (старое поведение).
  videoIntro?: {
    required:           boolean
    instruction:        string
    maxDurationSeconds: number
    minDurationSeconds: number
    thankYouText:       string
    questions:          { text: string; maxDurationSeconds: number }[]
  } | null
}

// Дефолты должны совпадать с DEFAULT_AFTER_VIDEO/DEFAULT_AFTER_ANKETA из
// components/vacancies/final-screens-settings.tsx (UI настроек). Если HR
// оставил поле пустым — используется дефолт.
const DEMO_DEFAULT_AFTER_VIDEO = {
  title:    "Спасибо за прохождение!",
  subtitle: "Заполните короткую анкету и мы свяжемся в чате",
  button:   "Заполнить анкету",
}
const DEMO_DEFAULT_AFTER_ANKETA = {
  title:    "Спасибо!",
  subtitle: "Мы изучим вашу анкету и свяжемся в чате",
}

interface FlatLesson {
  lessonId: string
  lessonTitle: string
  lessonEmoji: string
  blocks: Block[]
}

interface MediaAnswer {
  url: string
  mediaType: "video" | "audio" | "photo"
  duration?: number
  size?: number
  mime?: string
}

// ─── Variable replacement ────────────────────────────────────────────────────

function replaceVars(text: string, data: DemoData): string {
  const firstName = data.candidateName?.split(" ")[0] || data.candidateName
  const map: Record<string, string> = {
    "имя": firstName || "",
    "компания": data.companyName || "",
    "должность": data.vacancyTitle || "",
    "зарплата_от": data.salaryMin ? data.salaryMin.toLocaleString("ru-RU") : "",
    "зарплата_до": data.salaryMax ? data.salaryMax.toLocaleString("ru-RU") : "",
    "город": data.city || "",
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? `{{${key}}}`)
}

// ─── Group blocks by lesson for single-page rendering ────────────────────────
// Каждый урок — одна «страница» демо. Все его блоки рендерятся подряд.

function flattenLessons(lessons: Lesson[]): FlatLesson[] {
  return lessons.map((lesson) => ({
    lessonId:    lesson.id,
    lessonTitle: lesson.title,
    lessonEmoji: lesson.emoji,
    blocks:      lesson.blocks,
  }))
}

function flattenBlocks(lessons: Lesson[]): Block[] {
  return lessons.flatMap((l) => l.blocks)
}

// Возвращает статус блока по типу + текущему состоянию ответов/загрузок.
// "completed" — блок реально пройден; "skipped" — опциональный медиа,
// который кандидат явно пропустил; "pending" — ещё не пройден.
function isBlockCompleted(
  block: Block,
  taskAnswer: Record<string, string> | undefined,
  mediaAnswer: MediaAnswer | undefined,
  isSkipped: boolean,
  viewed: boolean,
): "completed" | "skipped" | "pending" {
  if (block.type === "task") {
    if (!block.questions || block.questions.length === 0) return viewed ? "completed" : "pending"
    const a = taskAnswer || {}
    const allAnswered = block.questions.every((q) => (a[q.id] ?? "").trim().length > 0)
    return allAnswered ? "completed" : "pending"
  }
  if (block.type === "media") {
    if (mediaAnswer?.url) return "completed"
    if (block.mediaRequired === false && isSkipped) return "skipped"
    return "pending"
  }
  // text/info/image/video/audio/file/button — completed после показа (handleNext)
  return viewed ? "completed" : "pending"
}

interface ProgressTotals {
  completed: number
  skipped: number
  total: number
  percent: number
}

function getProgress(
  allBlocks: Block[],
  taskAnswers: Record<string, Record<string, string>>,
  mediaUploaded: Record<string, MediaAnswer>,
  mediaSkipped: Record<string, boolean>,
  viewedBlockIds: Set<string>,
): ProgressTotals {
  let completed = 0
  let skipped = 0
  for (const b of allBlocks) {
    const s = isBlockCompleted(
      b,
      taskAnswers[b.id],
      mediaUploaded[b.id],
      !!mediaSkipped[b.id],
      viewedBlockIds.has(b.id),
    )
    if (s === "completed") completed++
    else if (s === "skipped") skipped++
  }
  const total = allBlocks.length
  const percent = total > 0 ? (completed / total) * 100 : 0
  return { completed, skipped, total, percent }
}

// ─── Block Renderers ─────────────────────────────────────────────────────────

// ─── Markdown-like table parser ──────────────────────────────────────────────
// Находит в тексте группы подряд идущих строк вида «|cell1|cell2|...|»
// и превращает их в HTML-таблицу. Остальные строки остаются обычным текстом
// с переносами через <br/>. Вторая строка-разделитель (|---|---|) трактуется
// как маркер заголовка. Если разделителя нет — первая строка всё равно
// рендерится как thead для удобства восприятия.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function isPipeTableRow(s: string): boolean {
  const t = s.trim()
  if (!(t.startsWith("|") && t.endsWith("|"))) return false
  // Должно быть как минимум 2 разделителя, то есть 2+ ячейки
  return (t.match(/\|/g) || []).length >= 2
}

function isPipeTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()))
}

function parsePipeRow(s: string): string[] {
  const t = s.trim().replace(/^\||\|$/g, "")
  return t.split("|").map((c) => c.trim())
}

function renderPipeTable(rows: string[][]): string {
  let headerCells: string[] | null = null
  let body = rows
  if (rows.length >= 2 && isPipeTableSeparator(rows[1])) {
    headerCells = rows[0]
    body = rows.slice(2).filter((r) => !isPipeTableSeparator(r))
  } else if (rows.length >= 1) {
    // Нет явного разделителя — первая строка считается заголовком
    headerCells = rows[0]
    body = rows.slice(1).filter((r) => !isPipeTableSeparator(r))
  }

  const thead = headerCells
    ? `<thead><tr>${headerCells
        .map(
          (c) =>
            `<th class="px-3 py-2 text-left text-[13px] font-semibold bg-gray-50 text-gray-700 border-b border-gray-200">${escapeHtml(c)}</th>`,
        )
        .join("")}</tr></thead>`
    : ""
  const tbody = `<tbody>${body
    .map(
      (r) =>
        `<tr class="odd:bg-white even:bg-gray-50/40">${r
          .map(
            (c) =>
              `<td class="px-3 py-2 align-top text-sm text-gray-800 border-b border-gray-100">${escapeHtml(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("")}</tbody>`

  return `<div class="my-3 overflow-x-auto rounded-lg border border-gray-200"><table class="w-full border-collapse text-left">${thead}${tbody}</table></div>`
}

function renderContentWithTables(content: string): string {
  // Если в контенте уже есть готовая HTML-таблица — не трогаем её и просто
  // возвращаем как есть (переводы строк вне таблицы конвертируем отдельно).
  if (/<(p|div|span|b|strong|i|em|br|table|ul|ol|li|h[1-6])[\s>]/i.test(content)) {
    return content
  }

  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (
      isPipeTableRow(lines[i]) &&
      i + 1 < lines.length &&
      isPipeTableRow(lines[i + 1])
    ) {
      const buf: string[] = []
      while (i < lines.length && isPipeTableRow(lines[i])) {
        buf.push(lines[i])
        i++
      }
      const rows = buf.map(parsePipeRow)
      out.push(renderPipeTable(rows))
    } else {
      out.push(escapeHtml(lines[i]) + "<br/>")
      i++
    }
  }
  // Убираем трейлинговый <br/>
  let html = out.join("")
  html = html.replace(/(?:<br\/>)+$/, "")
  return html
}

function TextBlock({ block, data }: { block: Block; data: DemoData }) {
  const html = renderContentWithTables(replaceVars(block.content, data))
  return (
    <div
      className="prose prose-sm sm:prose max-w-none text-gray-800 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function InfoBlock({ block, data }: { block: Block; data: DemoData }) {
  const styleMap = {
    info: "bg-blue-50 border-blue-200 text-blue-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    success: "bg-green-50 border-green-200 text-green-900",
    error: "bg-red-50 border-red-200 text-red-900",
  }
  const html = renderContentWithTables(replaceVars(block.content, data))
  return (
    <div className={`rounded-lg border p-4 ${styleMap[block.infoStyle] || styleMap.info}`}>
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function VideoBlock({ block }: { block: Block }) {
  if (!block.videoUrl) {
    return <div className="rounded-lg bg-gray-100 p-8 text-center text-gray-400">Видео не загружено</div>
  }
  return <VideoEmbed url={block.videoUrl} />
}

function ImageBlock({ block }: { block: Block }) {
  if (!block.imageUrl) {
    return <div className="rounded-lg bg-gray-100 p-8 text-center text-gray-400">Изображение не загружено</div>
  }
  return (
    <div className="overflow-hidden rounded-lg">
      <img src={block.imageUrl} alt={block.imageCaption || ""} className="w-full object-cover" />
      {block.imageCaption && <p className="mt-2 text-center text-sm text-gray-500">{block.imageCaption}</p>}
    </div>
  )
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question
  value: string
  onChange: (val: string) => void
}) {
  const type = question.answerType

  if (type === "single") {
    return (
      <div className="space-y-2">
        <p className="text-base sm:text-[17px] font-semibold leading-snug text-gray-900">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
        <RadioGroup value={value} onValueChange={onChange}>
          {question.options.map((opt, i) => {
            const isSelected = value === opt
            return (
              <Label
                key={i}
                htmlFor={`${question.id}-${i}`}
                className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                <RadioGroupItem value={opt} id={`${question.id}-${i}`} className="[color-scheme:light] accent-blue-600" />
                <span className="flex-1 text-gray-900">{opt}</span>
              </Label>
            )
          })}
        </RadioGroup>
      </div>
    )
  }

  if (type === "multiple") {
    const selected = value ? value.split("|||") : []
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter(x => x !== opt)
        : [...selected, opt]
      onChange(next.join("|||"))
    }
    return (
      <div className="space-y-2">
        <p className="text-base sm:text-[17px] font-semibold leading-snug text-gray-900">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const checked = selected.includes(opt)
            return (
              <label key={i} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer [color-scheme:light]"
                />
                <span className="flex-1 text-gray-900">{opt}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  if (type === "sort") {
    // Порядок хранится как строки через "|||"
    const currentOrder = value ? value.split("|||") : [...question.options]
    // Добавим опции которых ещё нет (на случай если options изменились)
    for (const opt of question.options) {
      if (!currentOrder.includes(opt)) currentOrder.push(opt)
    }
    // Удалим опции которых больше нет
    const order = currentOrder.filter(o => question.options.includes(o))

    const move = (idx: number, dir: -1 | 1) => {
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= order.length) return
      const next = [...order]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      onChange(next.join("|||"))
    }

    return (
      <div className="space-y-2">
        <p className="text-base sm:text-[17px] font-semibold leading-snug text-gray-900">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
        <p className="text-xs text-gray-500">Расставьте в правильном порядке</p>
        <div className="space-y-2">
          {order.map((opt, i) => (
            <div key={opt} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-3 text-gray-900 transition-colors hover:border-blue-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{i + 1}</span>
              <span className="flex-1 text-gray-900">{opt}</span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="h-8 w-8 rounded border border-gray-300 bg-white text-gray-700 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Вверх"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                className="h-8 w-8 rounded border border-gray-300 bg-white text-gray-700 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Вниз"
              >
                ▼
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === "yesno") {
    const yesSelected = value === "yes"
    const noSelected = value === "no"
    return (
      <div className="space-y-2">
        <p className="text-base sm:text-[17px] font-semibold leading-snug text-gray-900">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
        <RadioGroup value={value} onValueChange={onChange}>
          <Label
            htmlFor={`${question.id}-yes`}
            className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
              yesSelected
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
            }`}
          >
            <RadioGroupItem value="yes" id={`${question.id}-yes`} className="[color-scheme:light] accent-blue-600" />
            <span className="flex-1">Да</span>
          </Label>
          <Label
            htmlFor={`${question.id}-no`}
            className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
              noSelected
                ? "border-red-600 bg-red-600 text-white"
                : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
            }`}
          >
            <RadioGroupItem value="no" id={`${question.id}-no`} className="[color-scheme:light] accent-blue-600" />
            <span className="flex-1">Нет</span>
          </Label>
        </RadioGroup>
      </div>
    )
  }

  // short, long, text
  return (
    <div className="space-y-2">
      <p className="text-base sm:text-[17px] font-semibold leading-snug text-gray-900">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ваш ответ..."
        rows={type === "long" ? 5 : 3}
        className="resize-none bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
      />
    </div>
  )
}

function TaskBlock({
  block,
  data,
  answers,
  onAnswersChange,
}: {
  block: Block
  data: DemoData
  answers: Record<string, string>
  onAnswersChange: (answers: Record<string, string>) => void
}) {
  return (
    <div className="space-y-4">
      {block.taskTitle && (
        <h3 className="text-lg font-semibold text-gray-900">{replaceVars(block.taskTitle, data)}</h3>
      )}
      {block.taskDescription && (
        <p className="text-gray-600">{replaceVars(block.taskDescription, data)}</p>
      )}
      <div className="space-y-8">
        {block.questions.map((q) => (
          <QuestionInput
            key={q.id}
            question={q}
            value={answers[q.id] || ""}
            onChange={(val) => onAnswersChange({ ...answers, [q.id]: val })}
          />
        ))}
      </div>
    </div>
  )
}

function ButtonBlock({ block, onNext, nextDisabled }: { block: Block; onNext?: () => void; nextDisabled?: boolean }) {
  const cls = `inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors disabled:opacity-50 ${
    block.buttonVariant === "outline"
      ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
      : "bg-indigo-600 text-white hover:bg-indigo-700"
  }`
  const style = block.buttonColor && block.buttonVariant !== "outline"
    ? { backgroundColor: block.buttonColor } : undefined
  // «Куда ведёт: Ссылка» — внешняя ссылка; иначе (next/по умолчанию) — переход
  // на следующую страницу демо (на последней — завершение), как настроено в редакторе.
  const isUrl = (block.buttonTarget === "url" || (!block.buttonTarget && !!block.buttonUrl)) && !!block.buttonUrl
  return (
    <div className="flex justify-center">
      {isUrl ? (
        <a href={block.buttonUrl} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
          {block.buttonText || "Подробнее"}
        </a>
      ) : (
        <button type="button" onClick={onNext} disabled={nextDisabled || !onNext} className={cls} style={style}>
          {block.buttonText || "Далее"}
        </button>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DemoPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [taskAnswers, setTaskAnswers] = useState<Record<string, Record<string, string>>>({})
  const [mediaUploaded, setMediaUploaded] = useState<Record<string, MediaAnswer>>({})
  const [mediaSkipped, setMediaSkipped] = useState<Record<string, boolean>>({})
  const [mediaUploading, setMediaUploading] = useState<Record<string, boolean>>({})
  const isAnyMediaUploading = Object.values(mediaUploading).some(Boolean)
  const [viewedBlockIds, setViewedBlockIds] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const blockStartTime = useRef(Date.now())
  const handleNextRef = useRef(false)

  // Режим директора: ?as=hr или preview-токен — ответы и аплоады не сохраняются
  const isPreviewToken = typeof token === "string" && token.startsWith("test-demo-preview-")
  const [hasAsHrParam, setHasAsHrParam] = useState(false)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasAsHrParam(new URLSearchParams(window.location.search).get("as") === "hr")
    }
  }, [])
  const isPreviewMode = hasAsHrParam || isPreviewToken

  // Form state (must be declared before any conditional returns — React rules of hooks)
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [showFarewell, setShowFarewell] = useState(false)
  // #16: промежуточный экран после видео-уроков ДО анкеты. Default true —
  // показываем экран, кандидат нажимает кнопку → setAnketaIntroDismissed(true)
  // и попадает в анкету. Это снимает «шок» от резкого появления формы.
  const [anketaIntroDismissed, setAnketaIntroDismissed] = useState(false)
  const [formFirst, setFormFirst] = useState("")
  const [formLast, setFormLast] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formBirth, setFormBirth] = useState("")
  const [formCity, setFormCity] = useState("")
  const [formConsent, setFormConsent] = useState(false)
  // Анкета финального этапа — расширенные поля (сохраняются в candidates.anketa_answers)
  const [formTelegram, setFormTelegram] = useState("")
  const [formExperience, setFormExperience] = useState("")
  const [formPortfolio, setFormPortfolio] = useState("")
  const [formHh, setFormHh] = useState("")
  const [formOtherLinks, setFormOtherLinks] = useState("")
  const [formEmployment, setFormEmployment] = useState("")
  const [formNiches, setFormNiches] = useState("")

  // Fetch demo data
  useEffect(() => {
    fetch(`/api/public/demo/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
        } else {
          setData(d)
          // Restore progress.
          // schemaVersion=2: используем currentLesson и blocks[] со статусами.
          // Для legacy-записей (без schemaVersion) currentBlock мог означать
          // индекс урока — но мы ему не доверяем и начинаем с урока 0.
          // Для preview-токенов прогресс не восстанавливаем.
          const isPreviewToken = typeof token === "string" && token.startsWith("test-demo-preview-")
          if (!isPreviewToken && d.progress?.schemaVersion === 2) {
            const maxLessonIdx = Math.max(0, (d.lessons?.length || 1) - 1)
            if (typeof d.progress.currentLesson === "number" && d.progress.currentLesson > 0) {
              setCurrentIndex(Math.min(d.progress.currentLesson, maxLessonIdx))
            }
            if (Array.isArray(d.progress.blocks)) {
              const viewed = new Set<string>()
              const skipped: Record<string, boolean> = {}
              for (const b of d.progress.blocks) {
                if (b.blockId === "__complete__") continue
                if (b.status === "completed") viewed.add(b.blockId)
                else if (b.status === "skipped") skipped[b.blockId] = true
              }
              setViewedBlockIds(viewed)
              setMediaSkipped(skipped)
            }
          }
          // Restore answers
          if (Array.isArray(d.answers)) {
            const restoredTasks: Record<string, Record<string, string>> = {}
            const restoredMedia: Record<string, MediaAnswer> = {}
            for (const a of d.answers) {
              if (typeof a.answer === "object" && a.answer !== null) {
                if (typeof a.answer.url === "string" && typeof a.answer.mediaType === "string") {
                  restoredMedia[a.blockId] = a.answer as MediaAnswer
                } else {
                  restoredTasks[a.blockId] = a.answer
                }
              }
            }
            setTaskAnswers(restoredTasks)
            setMediaUploaded(restoredMedia)
          }
        }
      })
      .catch(() => setError("Не удалось загрузить курс"))
      .finally(() => setLoading(false))
  }, [token])

  // Initialize form fields when data arrives.
  // hh-кандидаты: prefill из resume (last_name/first_name/area.name) — кандидат
  // увидит уже заполненные поля и сможет поправить опечатки в hh.
  // Остальные источники (referral/прямой) — fallback на candidates.name (split)
  // и vacancy.city (поведение до prefill).
  useEffect(() => {
    if (data) {
      const parts = data.candidateName?.split(" ") || []
      setFormFirst(data.prefill?.first_name || parts[0] || "")
      setFormLast(data.prefill?.last_name || parts.slice(1).join(" ") || "")
      setFormCity(data.prefill?.city || data.city || "")
    }
  }, [data])

  const flatLessons = data ? flattenLessons(data.lessons) : []
  const totalLessons = flatLessons.length
  const currentFlat = flatLessons[currentIndex]
  const allBlocks = data ? flattenBlocks(data.lessons) : []
  const progress = getProgress(allBlocks, taskAnswers, mediaUploaded, mediaSkipped, viewedBlockIds)
  const progressPercent = progress.percent

  // ВСЕГО шагов прогресса = реальные блоки уроков + 2 виртуальных:
  // __anketa__ (анкета финального этапа) и __thanks__ (экран «Спасибо»).
  // Используется и при отправке batch'ей уроков, и при пост-финальных маркерах.
  const totalBlocksWithVirtual = allBlocks.length + 2

  // Single-block POST. Используется только для финального "__complete__".
  // Прогресс по уроку отправляется батчем через postLessonBatch.
  const postCompleteMarker = async (): Promise<boolean> => {
    if (isPreviewMode) return true
    try {
      const res = await fetch(`/api/public/demo/${token}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: "__complete__",
          answer: { completed: true },
          status: "completed",
          currentLesson: currentIndex,
          totalBlocks: totalBlocksWithVirtual,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // Виртуальные маркеры прогресса (__anketa__, __thanks__). Сервер исключает
  // их из anketa_answers, но засчитывает в demo_progress_json.blocks как
  // completed — это даёт фракцию current/total в HR-таблице.
  // Идемпотентен: сервер дедуплицирует blocks по blockId.
  const postVirtualMarkers = async (markerIds: string[]): Promise<void> => {
    if (isPreviewMode || markerIds.length === 0) return
    try {
      await fetch(`/api/public/demo/${token}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: markerIds.map((id) => ({
            blockId: id,
            answer: { virtual: true },
            status: "completed",
            timeSpent: 0,
          })),
          totalBlocks: totalBlocksWithVirtual,
        }),
      })
    } catch {
      // fire-and-forget — фракция в HR упадёт обратно к 16/17 при следующей загрузке,
      // но это лучше, чем блокировать пользовательский экран.
    }
  }

  const handleNext = async () => {
    if (!currentFlat) return
    // Синхронный guard от двойного клика — disabled={saving} срабатывает
    // только после ре-рендера, успевают пройти 2 клика подряд.
    if (handleNextRef.current) return
    handleNextRef.current = true

    try {
      // Собираем все task-блоки внутри текущего урока
      const taskBlocks = currentFlat.blocks.filter(
        (b) => b.type === "task" && b.questions.length > 0,
      )

      // Валидация обязательных вопросов по всем task-блокам урока
      for (const tb of taskBlocks) {
        const answers = taskAnswers[tb.id] || {}
        const missing = tb.questions.some((q) => q.required && !answers[q.id]?.trim())
        if (missing) return
      }

      // Валидация обязательных media-блоков урока.
      // F4: если режим видео-интервью — проверяем все sub-ключи вопросов.
      const viQuestions = data?.videoIntro?.questions ?? []
      const mediaBlocks = currentFlat.blocks.filter((b) => b.type === "media")
      for (const mb of mediaBlocks) {
        if (!mb.mediaRequired) continue
        if (viQuestions.length > 0) {
          // Видео-интервью: обязательны ответы на ВСЕ вопросы (согласовано с hasRequiredUnanswered)
          const missingVi = viQuestions.some((_: unknown, qi: number) => !mediaUploaded[`${mb.id}_vi_${qi}`])
          if (missingVi) return
        } else {
          if (!mediaUploaded[mb.id]) return
        }
      }

      // Собираем batch — все блоки урока, которые прошли через handleNext.
      // Опциональный media без upload и без skip не попадает (нет события).
      const passiveTypes = new Set(["text", "info", "image", "video", "audio", "file", "button"])
      const timeSpent = Math.round((Date.now() - blockStartTime.current) / 1000)
      type Outgoing = { blockId: string; answer: any; status: "completed" | "skipped"; timeSpent: number }
      const batch: Outgoing[] = []
      const nowViewed = new Set(viewedBlockIds)
      for (const b of currentFlat.blocks) {
        if (passiveTypes.has(b.type)) {
          batch.push({ blockId: b.id, answer: { viewed: true }, status: "completed", timeSpent })
          nowViewed.add(b.id)
        } else if (b.type === "task") {
          if ((b.questions?.length ?? 0) === 0) {
            batch.push({ blockId: b.id, answer: { viewed: true }, status: "completed", timeSpent })
            nowViewed.add(b.id)
          } else {
            batch.push({ blockId: b.id, answer: taskAnswers[b.id] || {}, status: "completed", timeSpent })
          }
        } else if (b.type === "media") {
          if (viQuestions.length > 0) {
            // F4: видео-интервью — сохраняем каждый ответ как отдельную запись в batch.
            // Ключи вида "<blockId>_vi_<idx>" прозрачны для answer/route.ts.
            let anyAnswered = false
            for (let qi = 0; qi < viQuestions.length; qi++) {
              const subKey = `${b.id}_vi_${qi}`
              if (mediaUploaded[subKey]) {
                batch.push({ blockId: subKey, answer: mediaUploaded[subKey], status: "completed", timeSpent })
                anyAnswered = true
              }
            }
            if (anyAnswered) nowViewed.add(b.id)
          } else if (mediaUploaded[b.id]) {
            // Передаём фактический MediaAnswer ({url, mediaType: "video", ...}), а
            // не маркер {viewed: true}. Иначе сервер перезапишет ответ в
            // anketa_answers и hasVideoVizitka рассчитается как false.
            batch.push({ blockId: b.id, answer: mediaUploaded[b.id], status: "completed", timeSpent })
          } else if (mediaSkipped[b.id]) {
            batch.push({ blockId: b.id, answer: { skipped: true }, status: "skipped", timeSpent })
          }
        }
      }

      // Отправка батчем — один POST, одна транзакция на сервере.
      let success = true
      if (batch.length > 0 && !isPreviewMode) {
        setSaving(true)
        try {
          const res = await fetch(`/api/public/demo/${token}/answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lessonId: currentFlat.lessonId,
              blocks: batch,
              currentLesson: currentIndex,
              totalBlocks: totalBlocksWithVirtual,
            }),
          })
          success = res.ok
          if (!success) console.error("[Demo] batch saveAnswer non-200:", res.status)
          // Помечаем viewed локально только при успехе — иначе при retry
          // локальное и серверное состояния разойдутся.
          if (success) setViewedBlockIds(nowViewed)
        } catch (err) {
          console.error("[Demo] batch saveAnswer failed:", err)
          success = false
        } finally {
          setSaving(false)
        }
      } else {
        // preview-mode или пустой batch — обновляем visualно, не идём в сеть
        setViewedBlockIds(nowViewed)
      }

      if (!success) return

      blockStartTime.current = Date.now()

      if (currentIndex < totalLessons - 1) {
        setCurrentIndex((i) => i + 1)
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" })
        }
      } else {
        setFinished(true)
        // Финальный маркер — отдельным single-POST. Если упадёт — completedAt
        // не проставится, кандидат увидит финальный экран, но HR может
        // не получить decision-стейдж до retry.
        await postCompleteMarker()
        // Если HR выключил пост-демо блок — кандидат увидит экран «Спасибо»
        // напрямую, минуя анкету. Чтобы фракция прогресса в HR не застряла на
        // N/N+2, отмечаем оба виртуальных маркера сразу.
        if (data?.postDemoSettings?.enabled === false) {
          void postVirtualMarkers(["__anketa__", "__thanks__"])
        }
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" })
        }
      }
    } finally {
      handleNextRef.current = false
    }
  }

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Курс не найден</h1>
          <p className="mt-2 text-gray-500">{error || "Проверьте ссылку и попробуйте снова"}</p>
        </div>
      </div>
    )
  }

  const brand = resolveBrand(data)
  const brandColor = brand.primary
  const bgColor = brand.bg
  const textColor = brand.text
  const navBtnColor = data.postDemoSettings?.navButtonColor || brandColor

  // ─── Final screen: form + thank you ────────────────────────────────────────

  const settingsForForm: PostDemoSettings = data.postDemoSettings ?? {}
  const fieldFirst    = resolveFormField(settingsForForm, "firstName")
  const fieldLast     = resolveFormField(settingsForForm, "lastName")
  const fieldEmail    = resolveFormField(settingsForForm, "email")
  const fieldPhone    = resolveFormField(settingsForForm, "phone")
  const fieldTelegram = resolveFormField(settingsForForm, "telegram")
  const fieldBirth    = resolveFormField(settingsForForm, "birthDate")
  const fieldCity     = resolveFormField(settingsForForm, "city")

  const isFormValid =
    (!fieldFirst.enabled    || !fieldFirst.required    || formFirst.trim().length    > 0) &&
    (!fieldLast.enabled     || !fieldLast.required     || formLast.trim().length     > 0) &&
    (!fieldEmail.enabled    || !fieldEmail.required    || formEmail.trim().length    > 0) &&
    (!fieldPhone.enabled    || !fieldPhone.required    || formPhone.trim().length    > 0) &&
    (!fieldTelegram.enabled || !fieldTelegram.required || formTelegram.trim().length > 0) &&
    (!fieldBirth.enabled    || (fieldBirth.required ? isValidBirthDateRu(formBirth) : (formBirth.length === 0 || isValidBirthDateRu(formBirth)))) &&
    (!fieldCity.enabled     || !fieldCity.required     || formCity.trim().length     > 0)

  const handleFormSubmit = async () => {
    if (!isFormValid) return
    setFormSubmitting(true)
    if (isPreviewMode) {
      setFormSubmitted(true)
      setFormSubmitting(false)
      return
    }
    try {
      await fetch(`/api/public/demo/${token}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fieldFirst.enabled ? formFirst.trim() : "",
          lastName:  fieldLast.enabled  ? formLast.trim()  : "",
          email:     fieldEmail.enabled ? formEmail.trim() : "",
          phone:     fieldPhone.enabled ? formPhone.trim() : "",
          birthDate: fieldBirth.enabled && isValidBirthDateRu(formBirth) ? ruBirthToIso(formBirth) : undefined,
          city:      fieldCity.enabled  ? (formCity.trim() || undefined) : undefined,
          anketa: {
            telegram:             fieldTelegram.enabled ? (formTelegram.trim() || undefined) : undefined,
            experienceSummary:    formExperience.trim() || undefined,
            portfolioUrl:         formPortfolio.trim() || undefined,
            hhUrl:                formHh.trim() || undefined,
            otherLinks:           formOtherLinks.trim() || undefined,
            employmentPreference: formEmployment || undefined,
            niches:               formNiches.trim() || undefined,
          },
        }),
      })
      // Анкета отправлена + сразу же отрендерится экран «Спасибо» — отмечаем
      // оба виртуальных маркера прогресса, чтобы фракция в HR показывала N+2.
      void postVirtualMarkers(["__anketa__", "__thanks__"])
      setFormSubmitted(true)
    } catch {
      setFormSubmitted(true)
    } finally {
      setFormSubmitting(false)
    }
  }

  if (finished) {
    // #25: порядок экранов после прохождения уроков:
    //   1. (если postDemoSettings.enabled === false) → статичный «спасибо»,
    //      минуя анкету и финальный экран. Выход.
    //   2. (если showFarewell) → прощальный экран после ручного клика. Выход.
    //   3. (если formSubmitted) → ФИНАЛЬНЫЙ «Спасибо!» (afterAnketa
    //      из finalScreens, fallback DEMO_DEFAULT_AFTER_ANKETA).
    //   4. (если !anketaIntroDismissed) → ПРОМЕЖУТОЧНЫЙ экран после видео
    //      (afterVideo из finalScreens, кнопка → переход в анкету).
    //   5. иначе → форма анкеты.
    // Это даёт последовательность: уроки → промежуточный → анкета →
    // submit → финальный. Два разных «Спасибо» — оба редактируемые
    // через FinalScreensSettings в табе «Воронка».
    if (data.postDemoSettings?.enabled === false) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: bgColor }}>
          <div className="text-center max-w-md space-y-4">
            {data.companyLogo && (
              <img
                src={data.companyLogo}
                alt={data.companyName}
                className="mx-auto h-16 w-auto object-contain mb-2"
              />
            )}
            {data.companyName && (
              <div className="text-sm font-medium text-gray-700">{data.companyName}</div>
            )}
            <h1 className="text-3xl font-bold text-gray-900">Спасибо за прохождение демонстрации!</h1>
            <p className="text-gray-600">Мы рассмотрим ваши ответы и свяжемся с вами в ближайшее время.</p>
          </div>
        </div>
      )
    }

    // Прощальный экран после клика «Хорошо, жду!» — закрытая вкладка для кандидата
    if (showFarewell) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: bgColor }}>
          <div className="text-center max-w-md space-y-4">
            {data.companyLogo && (
              <img
                src={data.companyLogo}
                alt={data.companyName}
                className="mx-auto h-16 w-auto object-contain mb-2"
              />
            )}
            {data.companyName && (
              <div className="text-sm font-medium text-gray-700">{data.companyName}</div>
            )}
            <h1 className="text-3xl font-bold text-gray-900">До скорой встречи! 👋</h1>
            <p className="text-gray-600">Эту вкладку можно закрыть.</p>
          </div>
        </div>
      )
    }

    // Thank you after form submit — динамический блок из post-demo settings.
    // #17/#25: упростили — без выбора времени интервью, единый текст из
    // finalScreens.afterAnketa (fallback на DEMO_DEFAULT_AFTER_ANKETA).
    if (formSubmitted) {
      const afterAnketaTitle    = data.finalScreens?.afterAnketa?.title?.trim() || DEMO_DEFAULT_AFTER_ANKETA.title
      const afterAnketaSubtitle = data.finalScreens?.afterAnketa?.subtitle?.trim() || DEMO_DEFAULT_AFTER_ANKETA.subtitle

      return (
        <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: bgColor }}>
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-4">
              {data.companyLogo && (
                <img
                  src={data.companyLogo}
                  alt={data.companyName}
                  className="mx-auto h-12 w-auto object-contain mb-2"
                />
              )}
              <h1 className="text-2xl font-bold text-gray-900">{afterAnketaTitle}</h1>
              <p className="text-gray-600 whitespace-pre-line">{afterAnketaSubtitle}</p>
            </div>
            {/* F7: кнопка «Продолжить в Telegram» — только если бот подключён */}
            {data.candidateTelegramDeepLink && (
              <div className="flex justify-center pt-2">
                <a
                  href={data.candidateTelegramDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors"
                  style={{ backgroundColor: "#2AABEE" }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                  </svg>
                  Продолжить общение в Telegram
                </a>
              </div>
            )}
          </div>
        </div>
      )
    }

    // #16: промежуточный экран после видео-визитки, ДО анкеты. Кнопка
    // переводит в форму. Если кандидат уже нажал её (anketaIntroDismissed
    // = true) или анкета уже частично заполнена — экран скипается.
    if (!anketaIntroDismissed) {
      const introTitle    = data.finalScreens?.afterVideo?.title?.trim() || DEMO_DEFAULT_AFTER_VIDEO.title
      const introSubtitle = data.finalScreens?.afterVideo?.subtitle?.trim() || DEMO_DEFAULT_AFTER_VIDEO.subtitle
      const introButton   = data.finalScreens?.afterVideo?.button?.trim() || DEMO_DEFAULT_AFTER_VIDEO.button
      return (
        <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: bgColor }}>
          <div className="w-full max-w-md space-y-6 text-center">
            {data.companyLogo && (
              <img
                src={data.companyLogo}
                alt={data.companyName}
                className="mx-auto h-12 w-auto object-contain mb-2"
              />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{introTitle}</h1>
            <p className="text-gray-600 whitespace-pre-line">{introSubtitle}</p>
            <button
              type="button"
              onClick={() => setAnketaIntroDismissed(true)}
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors"
              style={{ backgroundColor: data.brandPrimaryColor || "#3b82f6" }}
            >
              {introButton}
            </button>
          </div>
        </div>
      )
    }

    // Candidate form — анкета финального этапа
    const EMPLOYMENT_OPTIONS = [
      "Трудовой договор ТК РФ",
      "ИП",
      "Самозанятость",
      "ГПХ",
      "Обсуждаем",
    ]

    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: bgColor }}>
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center">
            {data.companyLogo && (
              <img
                src={data.companyLogo}
                alt={data.companyName}
                className="mx-auto h-12 w-auto object-contain mb-3"
              />
            )}
            {data.companyName && (
              <div className="text-sm font-medium text-gray-700 mb-3">{data.companyName}</div>
            )}
            <h1 className="text-xl font-bold mt-2" style={{ color: textColor }}>
              Анкета финального этапа
            </h1>
            <p className="text-sm text-gray-500 mt-1">Мы свяжемся с вами по поводу позиции &laquo;{data.vacancyTitle}&raquo;</p>
          </div>

          {/* Ф5: текст-обёртка из vacancy.descriptionJson.anketaIntro (если задана HR). */}
          {(() => {
            const introTitle = data.anketaIntro?.title?.trim() || "Заполните ваши данные!"
            const introDescription = data.anketaIntro?.description?.trim()
              || "Мы разберём ваши ответы — в том числе ответы на вопросы — и свяжемся с вами.\n\nЖдём Вас!"
            return (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-gray-700 space-y-3 leading-relaxed">
                <p className="font-medium text-gray-800">{introTitle}</p>
                <p className="whitespace-pre-line">{introDescription}</p>
              </div>
            )
          })()}

          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">

            {/* Основные данные */}
            {(() => {
              const inputClass = "h-10 bg-white border-gray-300 text-gray-900 placeholder:text-slate-400 placeholder:font-normal placeholder:[-webkit-text-fill-color:#94a3b8] focus-visible:border-blue-500 focus-visible:ring-blue-200"
              const labelClass = "text-xs text-gray-700"
              const inputStyle = {
                WebkitBoxShadow: "0 0 0 1000px white inset",
                WebkitTextFillColor: "#111827",
                color: "#111827",
                backgroundColor: "#fff",
              } as React.CSSProperties
              const requiredMark = (req: boolean) => req ? <span className="text-red-500">*</span> : null
              return (
                <>
                  <div className="space-y-4">
                    {fieldFirst.enabled && (
                      <div className="space-y-1">
                        <Label className={labelClass}>Имя {requiredMark(fieldFirst.required)}</Label>
                        <Input value={formFirst} onChange={e => setFormFirst(e.target.value)} placeholder="Иван" className={inputClass} style={inputStyle} />
                      </div>
                    )}
                    {fieldLast.enabled && (
                      <div className="space-y-1">
                        <Label className={labelClass}>Фамилия {requiredMark(fieldLast.required)}</Label>
                        <Input value={formLast} onChange={e => setFormLast(e.target.value)} placeholder="Иванов" className={inputClass} style={inputStyle} />
                      </div>
                    )}
                  </div>
                  {fieldEmail.enabled && (
                    <div className="space-y-1">
                      <Label className={labelClass}>Email {requiredMark(fieldEmail.required)}</Label>
                      <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="ivan@mail.ru" type="email" className={inputClass} style={inputStyle} />
                    </div>
                  )}
                  <div className="space-y-4">
                    {fieldPhone.enabled && (
                      <div className="space-y-1">
                        <Label className={labelClass}>Телефон {requiredMark(fieldPhone.required)}</Label>
                        <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+7 (999) 123-45-67" className={inputClass} style={inputStyle} />
                      </div>
                    )}
                    {fieldTelegram.enabled && (
                      <div className="space-y-1">
                        <Label className={labelClass}>Telegram {requiredMark(fieldTelegram.required)}</Label>
                        <Input value={formTelegram} onChange={e => setFormTelegram(e.target.value)} placeholder="@username" className={inputClass} style={inputStyle} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {fieldBirth.enabled && (
                      <div className="space-y-1">
                        <Label className={labelClass}>Дата рождения {requiredMark(fieldBirth.required)}</Label>
                        <Input
                          value={formBirth}
                          onChange={e => setFormBirth(maskBirthDateRu(e.target.value))}
                          type="text"
                          inputMode="numeric"
                          placeholder="дд.мм.гггг"
                          maxLength={10}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    )}
                    {fieldCity.enabled && (
                      <div className="space-y-1">
                        <Label className={labelClass}>Город {requiredMark(fieldCity.required)}</Label>
                        <Input value={formCity} onChange={e => setFormCity(e.target.value)} placeholder="Москва" className={inputClass} style={inputStyle} />
                      </div>
                    )}
                  </div>
                </>
              )
            })()}

            {/* Согласие */}
            <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={formConsent}
                onChange={e => setFormConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 cursor-pointer flex-shrink-0 bg-white [color-scheme:light]"
                style={{ accentColor: brandColor }}
              />
              <span>
                Я согласен на обработку персональных данных в соответствии с <a href="/politicahr2026" target="_blank" className="underline hover:opacity-80">ФЗ-152</a>. Данные используются только для целей найма.
              </span>
            </label>

            <Button className="w-full h-11" style={{ backgroundColor: brandColor }} onClick={handleFormSubmit}
              disabled={formSubmitting || !isFormValid || !formConsent}>
              {formSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Отправить
            </Button>
          </div>

        </div>
      </div>
    )
  }

  // ─── Block content ─────────────────────────────────────────────────────────

  if (!currentFlat) return null

  // F4: вопросы видео-интервью из конфига вакансии
  const viQuestions = data.videoIntro?.questions ?? []

  // Валидация: хоть один task-блок урока с незаполненным обязательным вопросом
  // или обязательный media-блок без загруженного файла
  const hasRequiredUnanswered = currentFlat.blocks.some((b) => {
    if (b.type === "task" && b.questions.length > 0) {
      const a = taskAnswers[b.id] || {}
      return b.questions.some((q) => q.required && !a[q.id]?.trim())
    }
    if (b.type === "media" && b.mediaRequired) {
      if (viQuestions.length > 0) {
        // Видео-интервью: обязательны ответы на ВСЕ вопросы
        return viQuestions.some((_, qi) => !mediaUploaded[`${b.id}_vi_${qi}`])
      }
      return !mediaUploaded[b.id]
    }
    // PDF-презентация: требуем долистать до последнего слайда (если включено).
    if (b.type === "pdf" && b.pdfRequireComplete !== false && (b.pdfPages?.length ?? 0) > 0) {
      return !viewedBlockIds.has(b.id)
    }
    return false
  })

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: bgColor }}>
      {/* Header + Progress */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {data.companyLogo && (
                <img src={data.companyLogo} alt="" className="h-6 w-6 rounded object-contain flex-shrink-0" />
              )}
              <span className="text-sm font-medium text-gray-700 truncate">{data.companyName}</span>
              {isPreviewMode && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
                  Режим директора — ответы не сохраняются
                </span>
              )}
            </div>
            <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
              Шаг {currentIndex + 1} из {totalLessons}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      {/* Content — все блоки текущего урока рендерятся на одной странице */}
      <div className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          {/* Lesson header — скрываем для PDF-презентации: слайдер сам себе
              заголовок, иначе над ним висит лишнее название урока. */}
          {!currentFlat.blocks.some((b) => b.type === "pdf" && (b.pdfPages?.length ?? 0) > 0) && (
            <div className="mb-4">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {currentFlat.lessonEmoji} {currentFlat.lessonTitle}
              </span>
            </div>
          )}

          {/* Blocks — все блоки в одной сплошной белой карточке */}
          <div className="rounded-xl bg-white overflow-hidden">
            {currentFlat.blocks.map((block) => (
              <div
                key={block.id}
                className="px-5 py-4 sm:px-8 sm:py-6 space-y-4"
              >
                {block.type === "text" && <TextBlock block={block} data={data} />}
                {block.type === "info" && <InfoBlock block={block} data={data} />}
                {block.type === "video" && <VideoBlock block={block} />}
                {block.type === "image" && <ImageBlock block={block} />}
                {block.type === "button" && <ButtonBlock block={block} onNext={handleNext} nextDisabled={hasRequiredUnanswered || saving || isAnyMediaUploading} />}
                {block.type === "task" && (
                  <TaskBlock
                    block={block}
                    data={data}
                    answers={taskAnswers[block.id] || {}}
                    onAnswersChange={(a) =>
                      setTaskAnswers((prev) => ({ ...prev, [block.id]: a }))
                    }
                  />
                )}
                {block.type === "audio" && block.audioUrl && (
                  <div className="space-y-2">
                    {block.audioTitle && (
                      <p className="font-medium text-gray-800">{block.audioTitle}</p>
                    )}
                    <audio src={block.audioUrl} controls className="w-full" />
                  </div>
                )}
                {block.type === "file" && block.fileUrl && (
                  <a
                    href={block.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-2xl">📄</span>
                    <span className="font-medium text-gray-700">
                      {block.fileName || "Скачать файл"}
                    </span>
                  </a>
                )}
                {block.type === "stories" && (
                  <StoriesPlayer
                    cards={block.storiesCards ?? []}
                    ctaEnabled={block.storiesCtaEnabled}
                    ctaText={block.storiesCtaText}
                    ctaCaption={block.storiesCtaCaption}
                    onCta={handleNext}
                  />
                )}
                {block.type === "pdf" && (
                  <PdfSlidesViewer
                    pages={block.pdfPages ?? []}
                    aspect={block.pdfAspect || 16 / 9}
                    brandColor={brandColor}
                    caption={block.pdfCaption || undefined}
                    allowDownload={block.pdfAllowDownload}
                    pdfUrl={block.pdfUrl}
                    fileName={block.pdfFileName}
                    onReachedEnd={() =>
                      setViewedBlockIds((prev) => {
                        if (prev.has(block.id)) return prev
                        const next = new Set(prev)
                        next.add(block.id)
                        return next
                      })
                    }
                  />
                )}
                {block.type === "media" && viQuestions.length > 0 && (
                  // F4: режим видео-интервью — вопросы по одному с прогрессом
                  <VideoInterviewBlock
                    questions={viQuestions}
                    blockId={block.id}
                    token={token}
                    brandColor={brandColor}
                    isRequired={block.mediaRequired !== false}
                    previewMode={isPreviewMode}
                    uploadedAnswers={mediaUploaded}
                    onUploaded={(subKey, ans) =>
                      setMediaUploaded((prev) => ({ ...prev, [subKey]: ans }))
                    }
                    onUploadingChange={(subKey, uploading) =>
                      setMediaUploading((prev) => {
                        if (!!prev[subKey] === uploading) return prev
                        const next = { ...prev }
                        if (uploading) next[subKey] = true
                        else delete next[subKey]
                        return next
                      })
                    }
                  />
                )}
                {block.type === "media" && viQuestions.length === 0 && (
                  // Старый режим — одна визитка
                  <MediaBlock
                    block={block}
                    token={token}
                    brandColor={brandColor}
                    existing={mediaUploaded[block.id]}
                    previewMode={isPreviewMode}
                    skipped={!!mediaSkipped[block.id]}
                    onUploaded={(ans) => {
                      setMediaUploaded((prev) => ({ ...prev, [block.id]: ans }))
                      // Если кандидат сначала пропустил, а потом всё-таки загрузил —
                      // снимаем пометку «skipped».
                      setMediaSkipped((prev) => {
                        if (!prev[block.id]) return prev
                        const next = { ...prev }
                        delete next[block.id]
                        return next
                      })
                    }}
                    onSkip={() =>
                      setMediaSkipped((prev) => ({ ...prev, [block.id]: true }))
                    }
                    onUnskip={() =>
                      setMediaSkipped((prev) => {
                        if (!prev[block.id]) return prev
                        const next = { ...prev }
                        delete next[block.id]
                        return next
                      })
                    }
                    onUploadingChange={(uploading) =>
                      setMediaUploading((prev) => {
                        if (!!prev[block.id] === uploading) return prev
                        const next = { ...prev }
                        if (uploading) next[block.id] = true
                        else delete next[block.id]
                        return next
                      })
                    }
                  />
                )}
              </div>
            ))}

            {/* Панель навигации скрыта (showSystemNav=false) — финиш всё равно
                обязателен: рендерим ОДНУ кнопку инлайн в потоке контента
                (без «Назад» и sticky-бара), иначе кандидат не сможет завершить. */}
            {!(data.postDemoSettings?.showSystemNav === true
              || (data.postDemoSettings?.showSystemNav === undefined && totalLessons > 1)) && (
              <div className="pt-4 flex justify-center">
                <Button
                  onClick={handleNext}
                  disabled={hasRequiredUnanswered || saving || isAnyMediaUploading}
                  title={isAnyMediaUploading ? "Дождитесь окончания загрузки видео" : undefined}
                  className="h-12 text-base font-medium px-8"
                  style={{ backgroundColor: navBtnColor, borderColor: navBtnColor }}
                >
                  {saving || isAnyMediaUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : currentIndex === totalLessons - 1 ? (
                    data.postDemoSettings?.navButtonText || "Завершить"
                  ) : (
                    <>
                      {data.postDemoSettings?.navButtonText || "Далее"}
                      <ChevronRight className="ml-1 h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      {(() => {
        const showNav = data.postDemoSettings?.showSystemNav === true
          || (data.postDemoSettings?.showSystemNav === undefined && totalLessons > 1)
        if (!showNav) return null
        return (
          <div className="sticky bottom-0 border-t bg-white/90 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl px-4 py-4 flex gap-3">
              {currentIndex > 0 && (
                <Button
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  variant="outline"
                  className="h-12 text-base font-medium px-6"
                  disabled={saving}
                >
                  <ChevronRight className="mr-1 h-5 w-5 rotate-180" />
                  Назад
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={hasRequiredUnanswered || saving || isAnyMediaUploading}
                title={isAnyMediaUploading ? "Дождитесь окончания загрузки видео" : undefined}
                className="flex-1 h-12 text-base font-medium"
                style={{ backgroundColor: navBtnColor, borderColor: navBtnColor }}
              >
                {saving || isAnyMediaUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : currentIndex === totalLessons - 1 ? (
                  // Заданное HR название приоритетно и на последней странице
                  data.postDemoSettings?.navButtonText || "Завершить"
                ) : (
                  <>
                    {data.postDemoSettings?.navButtonText || "Далее"}
                    <ChevronRight className="ml-1 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Media recording block ───────────────────────────────────────────────────

const MAX_MEDIA_SIZE = 50 * 1024 * 1024

// iOS-friendly: mp4 первым — Safari не поддерживает webm.
const VIDEO_MIME_CANDIDATES = [
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
]
const AUDIO_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mpeg",
]

function pickSupportedMime(candidates: string[]): string | null {
  if (typeof MediaRecorder === "undefined") return null
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch {
      // ignore
    }
  }
  return null
}

function mimeToExt(mime: string): string {
  if (mime.includes("webm")) return "webm"
  if (mime.includes("mp4")) return "mp4"
  if (mime.includes("mpeg")) return "mp3"
  if (mime.includes("jpeg")) return "jpg"
  if (mime.includes("png")) return "png"
  if (mime.includes("gif")) return "gif"
  if (mime.includes("heic")) return "heic"
  return "bin"
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

// ─── F4: Video Interview Block ───────────────────────────────────────────────
// Пошаговый режим для «Видео-интервью» — кандидат отвечает на каждый вопрос
// по очереди. Каждый ответ хранится в mediaUploaded под ключом
// "<blockId>_vi_<idx>" (субключи прозрачны для существующей логики сохранения).

function VideoInterviewBlock({
  questions,
  blockId,
  token,
  brandColor,
  isRequired,
  previewMode,
  uploadedAnswers,
  onUploaded,
  onUploadingChange,
}: {
  questions:        { text: string; maxDurationSeconds: number }[]
  blockId:          string
  token:            string
  brandColor:       string
  isRequired:       boolean
  previewMode?:     boolean
  uploadedAnswers:  Record<string, MediaAnswer>
  onUploaded:       (subKey: string, ans: MediaAnswer) => void
  onUploadingChange?: (subKey: string, uploading: boolean) => void
}) {
  // Определяем текущий активный шаг: первый вопрос без ответа.
  // После ответа на все — остаёмся на последнем (кандидат видит «все записаны»).
  const answeredCount = questions.filter((_, i) => !!uploadedAnswers[`${blockId}_vi_${i}`]).length
  const [activeStep, setActiveStep] = useState<number>(() => {
    const firstUnanswered = questions.findIndex((_, i) => !uploadedAnswers[`${blockId}_vi_${i}`])
    return firstUnanswered === -1 ? questions.length - 1 : firstUnanswered
  })

  // Когда ответ записан, двигаемся к следующему вопросу автоматически
  const handleQuestionUploaded = (idx: number, ans: MediaAnswer) => {
    const subKey = `${blockId}_vi_${idx}`
    onUploaded(subKey, ans)
    // Переходим к следующему вопросу если он есть
    if (idx < questions.length - 1) {
      setActiveStep(idx + 1)
    }
  }

  const allAnswered = answeredCount === questions.length

  return (
    <div className="space-y-4">
      {/* Прогресс вопросов */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          Вопрос {Math.min(activeStep + 1, questions.length)} из {questions.length}
        </p>
        {allAnswered && (
          <span className="text-xs text-emerald-600 font-medium">
            Все ответы записаны ✓
          </span>
        )}
      </div>

      {/* Шаги-индикаторы */}
      <div className="flex gap-1.5">
        {questions.map((_, i) => {
          const answered = !!uploadedAnswers[`${blockId}_vi_${i}`]
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveStep(i)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                answered
                  ? "bg-emerald-500"
                  : i === activeStep
                  ? "bg-blue-500"
                  : "bg-gray-200"
              }`}
              title={`Вопрос ${i + 1}`}
            />
          )
        })}
      </div>

      {/* Активный вопрос */}
      {questions.map((q, i) => {
        if (i !== activeStep) return null
        const subKey = `${blockId}_vi_${i}`
        const existing = uploadedAnswers[subKey]
        // Создаём фиктивный Block для MediaBlock с параметрами вопроса
        const fakeBlock: Block = {
          id: subKey,
          type: "media",
          content: "",
          imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
          videoUrl: "", videoTitleTop: "", videoCaption: "",
          audioUrl: "", audioTitle: "", audioTitleTop: "", audioCaption: "",
          fileUrl: "", fileName: "", fileTitleTop: "", fileCaption: "",
          infoStyle: "info",
          buttonText: "", buttonUrl: "", buttonVariant: "primary",
          taskTitle: "", taskDescription: "", questions: [],
          mediaAllowVideo: true,
          mediaAllowAudio: false,
          mediaAllowPhoto: false,
          mediaMaxDuration: q.maxDurationSeconds,
          mediaRequired: isRequired,
          mediaInstruction: q.text,
        }
        return (
          <div key={subKey} className="space-y-2">
            <p className="text-sm font-semibold text-gray-800 leading-snug">{q.text}</p>
            <MediaBlock
              block={fakeBlock}
              token={token}
              brandColor={brandColor}
              existing={existing}
              previewMode={previewMode}
              skipped={false}
              onUploaded={(ans) => handleQuestionUploaded(i, ans)}
              onUploadingChange={(uploading) => onUploadingChange?.(subKey, uploading)}
            />
          </div>
        )
      })}

      {/* Кнопки навигации между вопросами */}
      {questions.length > 1 && (
        <div className="flex gap-2 pt-1">
          {activeStep > 0 && (
            <button
              type="button"
              onClick={() => setActiveStep(s => Math.max(0, s - 1))}
              className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              ← Предыдущий вопрос
            </button>
          )}
          {activeStep < questions.length - 1 && !!uploadedAnswers[`${blockId}_vi_${activeStep}`] && (
            <button
              type="button"
              onClick={() => setActiveStep(s => Math.min(questions.length - 1, s + 1))}
              className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              Следующий вопрос →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type MediaBlockMode = "idle" | "recording" | "preview" | "uploading" | "done" | "error"

function MediaBlock({
  block,
  token,
  brandColor,
  existing,
  previewMode,
  skipped,
  onUploaded,
  onSkip,
  onUnskip,
  onUploadingChange,
}: {
  block: Block
  token: string
  brandColor: string
  existing?: MediaAnswer
  previewMode?: boolean
  skipped?: boolean
  onUploaded: (ans: MediaAnswer) => void
  onSkip?: () => void
  onUnskip?: () => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const allowVideo = block.mediaAllowVideo ?? true
  const allowAudio = block.mediaAllowAudio ?? false
  const allowPhoto = block.mediaAllowPhoto ?? false
  const maxDuration = block.mediaMaxDuration === undefined ? 60 : block.mediaMaxDuration
  const isOptional = block.mediaRequired === false

  const [mode, setMode] = useState<MediaBlockMode>(existing ? "done" : "idle")
  const [recType, setRecType] = useState<"video" | "audio" | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMime, setPreviewMime] = useState<string>("")
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [errMsg, setErrMsg] = useState("")
  const [result, setResult] = useState<MediaAnswer | null>(existing ?? null)

  // Сообщаем родителю, когда идёт реальная отправка файла на сервер —
  // нужно, чтобы заблокировать кнопку «Завершить» пока не закончится upload.
  useEffect(() => {
    onUploadingChange?.(mode === "uploading")
  }, [mode, onUploadingChange])

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)
  const blobMimeRef = useRef<string>("")
  const blobMediaTypeRef = useRef<"video" | "audio" | "photo">("video")
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)
  const fallbackTimerRef = useRef<number | null>(null)
  // Дублируем elapsed/previewUrl в refs, чтобы upload, вызванный из onstop /
  // pickPhoto / pickVideoFile (т.е. из устаревшего замыкания), видел свежие
  // значения без пересоздания обработчика.
  const elapsedRef = useRef(0)
  const previewUrlRef = useRef<string | null>(null)

  // Определяем, можно ли записывать через MediaRecorder — если нет, показываем file fallback
  const canRecordVideo = !!pickSupportedMime(VIDEO_MIME_CANDIDATES) && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  const canRecordAudio = !!pickSupportedMime(AUDIO_MIME_CANDIDATES) && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia

  // setErrMsg + лог в DevTools кандидата + (опц.) автооткрытие диалога загрузки
  // через 2с — чтобы кандидат не застревал, если запись физически не работает.
  const reportErr = useCallback((msg: string, err?: unknown, autoFallbackType?: "video" | "audio") => {
    setErrMsg(msg)
    console.warn("[MediaBlock]", msg, err ?? "")
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    if (autoFallbackType) {
      fallbackTimerRef.current = window.setTimeout(() => {
        if (autoFallbackType === "video") videoFileInputRef.current?.click()
        if (autoFallbackType === "audio") audioFileInputRef.current?.click()
      }, 2000)
    }
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    recorderRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = null
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRecording = async (type: "video" | "audio") => {
    setErrMsg("")
    try {
      // Видео-визитка — портретное 9:16 (как Stories/TikTok). На телефоне это
      // нативная ориентация, на десктопе UI ужимаем по maxWidth.
      const constraints: MediaStreamConstraints =
        type === "video"
          ? {
              audio: true,
              video: {
                facingMode: "user",
                aspectRatio: { ideal: 9 / 16 },
                width: { ideal: 720 },
                height: { ideal: 1280 },
              },
            }
          : { audio: true, video: false }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (type === "video") {
        const attachStream = () => {
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream
            videoPreviewRef.current.muted = true
            videoPreviewRef.current.play().catch(() => {})
          } else {
            setTimeout(attachStream, 50)
          }
        }
        attachStream()
      }

      const mime = type === "video"
        ? pickSupportedMime(VIDEO_MIME_CANDIDATES)
        : pickSupportedMime(AUDIO_MIME_CANDIDATES)
      if (!mime) {
        reportErr("Браузер не поддерживает запись. Открываем загрузку файла…", null, type)
        cleanup()
        return
      }

      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime })
        blobRef.current = blob
        blobMimeRef.current = mime
        blobMediaTypeRef.current = type
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        setPreviewUrl(url)
        setPreviewMime(mime)
        cleanup()
        // Авто-загрузка сразу после Стоп — без шага «Отправить».
        // Через "preview" не идём, чтобы не было окна, в котором кандидат
        // мог бы нажать «Далее» с локальным Blob, не дошедшим до сервера.
        void upload()
      }

      recorder.start()
      setRecType(type)
      elapsedRef.current = 0
      setElapsed(0)
      setMode("recording")

      const startedAt = Date.now()
      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000
        elapsedRef.current = secs
        setElapsed(secs)
        if (maxDuration !== null && secs >= maxDuration && recorder.state === "recording") {
          recorder.stop()
        }
      }, 200)
    } catch (err) {
      reportErr("Не удалось получить доступ к камере/микрофону. Открываем загрузку файла…", err, type)
      cleanup()
      setMode("idle")
    }
  }

  const stopRecording = () => {
    const rec = recorderRef.current
    if (rec && rec.state === "recording") rec.stop()
  }

  const resetToIdle = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
    setPreviewMime("")
    blobRef.current = null
    blobMimeRef.current = ""
    elapsedRef.current = 0
    setElapsed(0)
    setUploadProgress(0)
    setErrMsg("")
    setRecType(null)
    setMode("idle")
  }

  const pickPhoto = (file: File) => {
    if (file.size > MAX_MEDIA_SIZE) {
      reportErr("Файл больше 50MB. Выберите файл поменьше.")
      return
    }
    blobRef.current = file
    blobMimeRef.current = file.type || "image/jpeg"
    blobMediaTypeRef.current = "photo"
    elapsedRef.current = 0
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setPreviewMime(blobMimeRef.current)
    setErrMsg("")
    void upload()
  }

  const pickVideoFile = (file: File) => {
    if (file.size > MAX_MEDIA_SIZE) {
      reportErr("Файл больше 50MB. Запишите короче или выберите другой файл.")
      return
    }
    blobRef.current = file
    blobMimeRef.current = file.type || "video/mp4"
    blobMediaTypeRef.current = "video"
    elapsedRef.current = 0
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setPreviewMime(blobMimeRef.current)
    setErrMsg("")
    void upload()
  }

  const pickAudioFile = (file: File) => {
    if (file.size > MAX_MEDIA_SIZE) {
      reportErr("Файл больше 50MB. Выберите файл поменьше.")
      return
    }
    blobRef.current = file
    blobMimeRef.current = file.type || "audio/mp4"
    blobMediaTypeRef.current = "audio"
    elapsedRef.current = 0
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setPreviewMime(blobMimeRef.current)
    setErrMsg("")
    void upload()
  }

  const upload = async () => {
    const blob = blobRef.current
    if (!blob) return
    if (blob.size > MAX_MEDIA_SIZE) {
      reportErr("Размер файла больше 50MB. Попробуйте записать короче.")
      setMode("preview")
      return
    }

    setMode("uploading")
    setErrMsg("")

    const mediaType = blobMediaTypeRef.current
    const mime = blobMimeRef.current || blob.type || ""
    const ext = mimeToExt(mime)
    const fileName = `media.${ext}`
    const fileObj = blob instanceof File
      ? blob
      : new File([blob], fileName, { type: mime })
    const durationSecs = elapsedRef.current

    // Режим директора — имитируем «загрузку», ничего не отправляем на сервер
    if (previewMode) {
      const localUrl = URL.createObjectURL(blob)
      const answer: MediaAnswer = {
        url: localUrl,
        mediaType,
        duration: mediaType !== "photo" ? Math.round(durationSecs) : undefined,
        size: blob.size,
        mime,
      }
      setResult(answer)
      onUploaded(answer)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
      setMode("done")
      return
    }

    const fd = new FormData()
    fd.append("file", fileObj)
    fd.append("blockId", block.id)
    fd.append("mediaType", mediaType)
    if (mediaType !== "photo") fd.append("duration", String(Math.round(durationSecs)))

    setUploadProgress(0)
    try {
      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `/api/public/demo/${token}/upload-media`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText || "{}")
            if (xhr.status >= 200 && xhr.status < 300 && parsed?.url) {
              resolve(parsed)
            } else {
              reject(new Error(parsed?.error || "Ошибка загрузки"))
            }
          } catch {
            reject(new Error("Ошибка ответа сервера"))
          }
        }
        xhr.onerror = () => reject(new Error("Сеть недоступна"))
        xhr.send(fd)
      })
      const answer: MediaAnswer = {
        url: data.url,
        mediaType,
        duration: mediaType !== "photo" ? Math.round(durationSecs) : undefined,
        size: blob.size,
        mime,
      }
      setResult(answer)
      onUploaded(answer)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
      setMode("done")
    } catch (err) {
      reportErr(err instanceof Error ? err.message : "Ошибка загрузки. Попробуйте ещё раз.", err)
      setMode("preview")
    }
  }

  const iconClass = "h-6 w-6"
  const bigBtnBase = "h-12 min-w-12 px-4 rounded-xl font-medium inline-flex items-center justify-center gap-2 text-sm transition-colors"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <VideoIcon className="h-4 w-4 text-gray-500" />
        <span>Запись медиа</span>
        {block.mediaRequired && (
          <span className="text-xs font-normal text-red-600">* обязательно</span>
        )}
      </div>

      {block.mediaInstruction && (
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{block.mediaInstruction}</p>
      )}

      {/* Опциональное видео-визитка: мотивирующий баннер */}
      {isOptional && allowVideo && mode === "idle" && !skipped && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 leading-relaxed">
          <p>
            💡 С видео-визиткой ваши шансы выше — рекрутер увидит вас живым человеком.
            Запишите 1–2 минуты, это сильно выделит вас среди других кандидатов.
          </p>
        </div>
      )}

      {errMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {/* Опциональный media, который кандидат пометил как «пропущен» */}
      {mode === "idle" && skipped && isOptional && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-sm text-gray-700">Видео пропущено. Вы можете передумать и записать его до завершения курса.</p>
          <button
            onClick={() => onUnskip?.()}
            className={`${bigBtnBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-100`}
          >
            <RotateCcw className={iconClass} />
            Передумать, записать
          </button>
        </div>
      )}

      {mode === "idle" && !skipped && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {allowVideo && (
              <>
                <button
                  onClick={() => startRecording("video")}
                  disabled={!canRecordVideo}
                  title={!canRecordVideo ? "Запись недоступна в этом браузере — загрузите готовый файл" : undefined}
                  className={`${bigBtnBase} ${canRecordVideo ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
                >
                  <VideoIcon className={iconClass} />
                  Записать видео
                </button>
                <button
                  onClick={() => videoFileInputRef.current?.click()}
                  className={`${bigBtnBase} border border-blue-600 bg-white text-blue-700 hover:bg-blue-50`}
                >
                  <Upload className={iconClass} />
                  Загрузить файл
                </button>
                <input
                  ref={videoFileInputRef}
                  type="file"
                  accept="video/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickVideoFile(f)
                    e.target.value = ""
                  }}
                />
              </>
            )}

            {allowAudio && (
              <>
                <button
                  onClick={() => startRecording("audio")}
                  disabled={!canRecordAudio}
                  title={!canRecordAudio ? "Запись недоступна в этом браузере — загрузите готовый файл" : undefined}
                  className={`${bigBtnBase} ${canRecordAudio ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
                >
                  <Mic className={iconClass} />
                  Записать аудио
                </button>
                <button
                  onClick={() => audioFileInputRef.current?.click()}
                  className={`${bigBtnBase} border border-blue-600 bg-white text-blue-700 hover:bg-blue-50`}
                >
                  <Upload className={iconClass} />
                  Загрузить файл
                </button>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickAudioFile(f)
                    e.target.value = ""
                  }}
                />
              </>
            )}

            {allowPhoto && (
              <>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className={`${bigBtnBase} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  <Camera className={iconClass} />
                  Загрузить фото
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickPhoto(f)
                    e.target.value = ""
                  }}
                />
              </>
            )}
          </div>

          {(allowVideo || allowAudio) && (
            <p className="text-xs text-gray-500">
              Если запись не работает — загрузите готовый файл.
            </p>
          )}

          {/* Кнопка «Пропустить и завершить» — только для опциональных media */}
          {isOptional && onSkip && (
            <button
              onClick={() => onSkip()}
              className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Пропустить и завершить
            </button>
          )}
        </div>
      )}

      {mode === "recording" && (
        <div className="space-y-3">
          {recType === "video" ? (
            <div
              className="relative rounded-xl overflow-hidden bg-black mx-auto w-full"
              style={{ maxWidth: 360, aspectRatio: "9 / 16" }}
            >
              <video ref={videoPreviewRef} playsInline className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-sm font-medium">REC</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 rounded-xl bg-gray-100 border border-gray-300">
              <div className="flex items-center gap-3 text-gray-700">
                <span className="h-4 w-4 rounded-full bg-red-500 animate-pulse" />
                <Mic className="h-8 w-8" />
                <span className="text-lg font-medium">Идёт запись</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="font-mono font-bold tabular-nums" style={{ fontSize: "32px" }}>
              {formatTime(elapsed)}
              {maxDuration !== null && (
                <span className="text-gray-400 text-base font-normal"> / {formatTime(maxDuration)}</span>
              )}
            </div>
            <button
              onClick={stopRecording}
              className="h-12 min-w-12 px-5 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 inline-flex items-center gap-2 text-base"
            >
              <Square className="h-5 w-5 fill-white" />
              Стоп
            </button>
          </div>
        </div>
      )}

      {mode === "preview" && previewUrl && (
        <div className="space-y-3">
          {blobMediaTypeRef.current === "video" && (
            <video
              src={previewUrl}
              controls
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.duration > 1 && Number.isFinite(v.duration)) v.currentTime = 1
              }}
              className="rounded-xl bg-black mx-auto w-full"
              style={{ maxWidth: 360, aspectRatio: "9 / 16", objectFit: "cover" }}
            />
          )}
          {blobMediaTypeRef.current === "audio" && (
            <audio src={previewUrl} controls className="w-full" />
          )}
          {blobMediaTypeRef.current === "photo" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="w-full rounded-xl" />
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={resetToIdle}
              className={`${bigBtnBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
            >
              <RotateCcw className={iconClass} />
              Перезаписать
            </button>
            {errMsg && (
              <button
                onClick={() => upload()}
                className={`${bigBtnBase} text-white flex-1`}
                style={{ backgroundColor: brandColor }}
              >
                <Send className={iconClass} />
                Попробовать ещё раз
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "uploading" && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
            <span className="text-sm text-gray-700">
              {uploadProgress > 0 ? `Отправка… ${uploadProgress}%` : "Отправка…"}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${uploadProgress}%`, backgroundColor: brandColor }}
            />
          </div>
        </div>
      )}

      {mode === "done" && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>Отправлено</span>
          </div>
          {result.mediaType === "video" && (
            <video
              src={result.url}
              controls
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.duration > 1 && Number.isFinite(v.duration)) v.currentTime = 1
              }}
              className="rounded-xl bg-black mx-auto w-full"
              style={{ maxWidth: 360, aspectRatio: "9 / 16", objectFit: "cover" }}
            />
          )}
          {result.mediaType === "audio" && (
            <audio src={result.url} controls className="w-full" />
          )}
          {result.mediaType === "photo" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.url} alt="" className="w-full rounded-xl" />
          )}
          <button
            onClick={resetToIdle}
            className={`${bigBtnBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
          >
            <RotateCcw className={iconClass} />
            Переснять
          </button>
        </div>
      )}
    </div>
  )
}
