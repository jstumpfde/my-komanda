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

// ─── Types ───────────────────────────────────────────────────────────────────

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
  progress: { currentBlock?: number } | null
  answers: { blockId: string; answer: any }[] | null
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
  if (/<table[\s>]/i.test(content)) {
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
  // YouTube / Vimeo embed
  const isYoutube = block.videoUrl.includes("youtube.com") || block.videoUrl.includes("youtu.be")
  const isVimeo = block.videoUrl.includes("vimeo.com")
  if (isYoutube || isVimeo) {
    let src = block.videoUrl
    if (isYoutube) {
      const match = block.videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
      if (match) src = `https://www.youtube.com/embed/${match[1]}`
    }
    if (isVimeo) {
      const match = block.videoUrl.match(/vimeo\.com\/(\d+)/)
      if (match) src = `https://player.vimeo.com/video/${match[1]}`
    }
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg">
        <iframe src={src} className="h-full w-full" allowFullScreen allow="autoplay; encrypted-media" />
      </div>
    )
  }
  return (
    <video src={block.videoUrl} controls className="w-full rounded-lg" />
  )
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

  if (type === "single" || type === "multiple") {
    return (
      <div className="space-y-2">
        <p className="font-medium text-gray-800">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
        <RadioGroup value={value} onValueChange={onChange}>
          {question.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
              <RadioGroupItem value={opt} id={`${question.id}-${i}`} />
              <Label htmlFor={`${question.id}-${i}`} className="flex-1 cursor-pointer">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    )
  }

  if (type === "yesno") {
    return (
      <div className="space-y-2">
        <p className="font-medium text-gray-800">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
        <RadioGroup value={value} onValueChange={onChange}>
          <div className="flex items-center gap-2 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
            <RadioGroupItem value="yes" id={`${question.id}-yes`} />
            <Label htmlFor={`${question.id}-yes`} className="cursor-pointer">Да</Label>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
            <RadioGroupItem value="no" id={`${question.id}-no`} />
            <Label htmlFor={`${question.id}-no`} className="cursor-pointer">Нет</Label>
          </div>
        </RadioGroup>
      </div>
    )
  }

  // short, long, text
  return (
    <div className="space-y-2">
      <p className="font-medium text-gray-800">{question.text}{question.required && <span className="text-red-500"> *</span>}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ваш ответ..."
        rows={type === "long" ? 5 : 3}
        className="resize-none"
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
      <div className="space-y-5">
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

function ButtonBlock({ block }: { block: Block }) {
  return (
    <div className="flex justify-center">
      <a
        href={block.buttonUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors ${
          block.buttonVariant === "outline"
            ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
            : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
      >
        {block.buttonText || "Подробнее"}
      </a>
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
  const [saving, setSaving] = useState(false)
  const blockStartTime = useRef(Date.now())

  // Form state (must be declared before any conditional returns — React rules of hooks)
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
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
          // Restore progress — теперь currentBlock в БД означает «индекс урока».
          // Для старых записей, где сохранялся индекс блока, значение может
          // оказаться больше числа уроков — клампим к диапазону.
          if (typeof d.progress?.currentBlock === "number" && d.progress.currentBlock > 0) {
            const maxLessonIdx = Math.max(0, (d.lessons?.length || 1) - 1)
            setCurrentIndex(Math.min(d.progress.currentBlock, maxLessonIdx))
          }
          // Restore answers
          if (d.answers) {
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

  // Initialize form fields when data arrives
  useEffect(() => {
    if (data) {
      const parts = data.candidateName?.split(" ") || []
      setFormFirst(parts[0] || "")
      setFormLast(parts.slice(1).join(" ") || "")
      setFormCity(data.city || "")
    }
  }, [data])

  const flatLessons = data ? flattenLessons(data.lessons) : []
  const totalLessons = flatLessons.length
  const currentFlat = flatLessons[currentIndex]
  const progressPercent = totalLessons > 0 ? ((currentIndex + 1) / totalLessons) * 100 : 0

  const saveAnswer = useCallback(async (blockId: string, answer: any) => {
    const timeSpent = Math.round((Date.now() - blockStartTime.current) / 1000)
    try {
      await fetch(`/api/public/demo/${token}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId,
          answer,
          timeSpent,
          // Теперь индекс — это индекс УРОКА, а total — количество уроков.
          // Поле API называется currentBlock/totalBlocks исторически;
          // семантика изменилась, формат JSON — нет (обратная совместимость
          // по структуре сохранения прогресса).
          currentBlock: currentIndex,
          totalBlocks:  totalLessons,
        }),
      })
    } catch {
      // silently fail — answers are best-effort
    }
  }, [token, currentIndex, totalLessons])

  const handleNext = useCallback(async () => {
    if (!currentFlat) return

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

    // Валидация обязательных media-блоков урока
    const mediaBlocks = currentFlat.blocks.filter((b) => b.type === "media")
    for (const mb of mediaBlocks) {
      if (mb.mediaRequired && !mediaUploaded[mb.id]) return
    }

    // Сохраняем ответы по каждому task-блоку отдельно
    if (taskBlocks.length > 0) {
      setSaving(true)
      try {
        for (const tb of taskBlocks) {
          const answers = taskAnswers[tb.id] || {}
          await saveAnswer(tb.id, answers)
        }
      } finally {
        setSaving(false)
      }
    }

    blockStartTime.current = Date.now()

    if (currentIndex < totalLessons - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      setFinished(true)
      // Save final progress
      await saveAnswer("__complete__", { completed: true })
    }
  }, [currentFlat, currentIndex, totalLessons, taskAnswers, mediaUploaded, saveAnswer])

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

  // ─── Final screen: form + thank you ────────────────────────────────────────

  const handleFormSubmit = async () => {
    if (!formFirst.trim() || !formLast.trim() || !formEmail.trim() || !formPhone.trim()) return
    setFormSubmitting(true)
    try {
      await fetch(`/api/public/demo/${token}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formFirst.trim(),
          lastName: formLast.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim(),
          birthDate: formBirth || undefined,
          city: formCity.trim() || undefined,
          anketa: {
            telegram:             formTelegram.trim() || undefined,
            experienceSummary:    formExperience.trim() || undefined,
            portfolioUrl:         formPortfolio.trim() || undefined,
            hhUrl:                formHh.trim() || undefined,
            otherLinks:           formOtherLinks.trim() || undefined,
            employmentPreference: formEmployment || undefined,
            niches:               formNiches.trim() || undefined,
          },
        }),
      })
      setFormSubmitted(true)
    } catch {
      setFormSubmitted(true)
    } finally {
      setFormSubmitting(false)
    }
  }

  if (finished) {
    // Thank you after form submit
    if (formSubmitted) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: bgColor }}>
          <div className="w-full max-w-md text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: brandColor + "20" }}>
              <CheckCircle2 className="h-10 w-10" style={{ color: brandColor }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: textColor }}>Спасибо!</h1>
            <p className="text-gray-600">
              Мы рассмотрим вашу заявку на позицию &laquo;{data.vacancyTitle}&raquo; и свяжемся с вами в ближайшее время.
            </p>
            {data.companyLogo && (
              <img src={data.companyLogo} alt={data.companyName} className="mx-auto h-10 object-contain opacity-60" />
            )}
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
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4" style={{ backgroundColor: brandColor + "20" }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: brandColor }} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: textColor }}>
              Анкета финального этапа
            </h1>
            <p className="text-sm text-gray-500 mt-1">Мы свяжемся с вами по поводу позиции &laquo;{data.vacancyTitle}&raquo;</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">

            {/* Основные данные */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Имя <span className="text-red-500">*</span></Label>
                <Input value={formFirst} onChange={e => setFormFirst(e.target.value)} placeholder="Иван" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Фамилия <span className="text-red-500">*</span></Label>
                <Input value={formLast} onChange={e => setFormLast(e.target.value)} placeholder="Иванов" className="h-10" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email <span className="text-red-500">*</span></Label>
              <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="ivan@mail.ru" type="email" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Телефон <span className="text-red-500">*</span></Label>
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+7 (999) 123-45-67" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telegram</Label>
                <Input value={formTelegram} onChange={e => setFormTelegram(e.target.value)} placeholder="@username" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Дата рождения</Label>
                <Input value={formBirth} onChange={e => setFormBirth(e.target.value)} type="date" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Город</Label>
                <Input value={formCity} onChange={e => setFormCity(e.target.value)} placeholder="Москва" className="h-10" />
              </div>
            </div>

            {/* Опыт */}
            <div className="space-y-1 pt-2">
              <Label className="text-xs">Опыт работы — последние 2–3 места</Label>
              <Textarea
                value={formExperience}
                onChange={e => setFormExperience(e.target.value)}
                rows={3}
                placeholder="Компания, должность, период, ключевые результаты"
                className="resize-none text-sm"
              />
            </div>

            {/* Ссылки */}
            <div className="space-y-1">
              <Label className="text-xs">Портфолио / кейсы</Label>
              <Input value={formPortfolio} onChange={e => setFormPortfolio(e.target.value)} placeholder="https://…" type="url" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">HH.ru</Label>
                <Input value={formHh} onChange={e => setFormHh(e.target.value)} placeholder="https://hh.ru/resume/…" type="url" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Другие ссылки</Label>
                <Input value={formOtherLinks} onChange={e => setFormOtherLinks(e.target.value)} placeholder="LinkedIn, GitHub, соцсети" className="h-10" />
              </div>
            </div>

            {/* Форма оформления */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs">Предпочитаемая форма оформления</Label>
              <RadioGroup value={formEmployment} onValueChange={setFormEmployment} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EMPLOYMENT_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2.5 cursor-pointer hover:bg-gray-50 transition-colors text-sm">
                    <RadioGroupItem value={opt} id={`emp-${opt}`} />
                    <span className="flex-1">{opt}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Ниши */}
            <div className="space-y-1 pt-1">
              <Label className="text-xs">Опыт в нишах</Label>
              <Textarea
                value={formNiches}
                onChange={e => setFormNiches(e.target.value)}
                rows={2}
                placeholder="B2B SaaS, EdTech, FinTech, маркетплейсы…"
                className="resize-none text-sm"
              />
            </div>

            {/* Согласие */}
            <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={formConsent}
                onChange={e => setFormConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 cursor-pointer flex-shrink-0"
                style={{ accentColor: brandColor }}
              />
              <span>
                Я согласен на обработку персональных данных в соответствии с <a href="/politicahr2026" target="_blank" className="underline hover:opacity-80">ФЗ-152</a>. Данные используются только для целей найма.
              </span>
            </label>

            <Button className="w-full h-11" style={{ backgroundColor: brandColor }} onClick={handleFormSubmit}
              disabled={formSubmitting || !formFirst.trim() || !formLast.trim() || !formEmail.trim() || !formPhone.trim() || !formConsent}>
              {formSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Отправить заявку
            </Button>
          </div>

          {data.companyLogo && (
            <img src={data.companyLogo} alt={data.companyName} className="mx-auto h-8 object-contain opacity-40" />
          )}
        </div>
      </div>
    )
  }

  // ─── Block content ─────────────────────────────────────────────────────────

  if (!currentFlat) return null

  // Валидация: хоть один task-блок урока с незаполненным обязательным вопросом
  // или обязательный media-блок без загруженного файла
  const hasRequiredUnanswered = currentFlat.blocks.some((b) => {
    if (b.type === "task" && b.questions.length > 0) {
      const a = taskAnswers[b.id] || {}
      return b.questions.some((q) => q.required && !a[q.id]?.trim())
    }
    if (b.type === "media" && b.mediaRequired) {
      return !mediaUploaded[b.id]
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
            </div>
            <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
              {currentIndex + 1} из {totalLessons}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      {/* Content — все блоки текущего урока рендерятся на одной странице */}
      <div className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          {/* Lesson header */}
          <div className="mb-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              {currentFlat.lessonEmoji} {currentFlat.lessonTitle}
            </span>
          </div>

          {/* Blocks — по одной карточке на каждый блок урока, со скроллом */}
          <div className="space-y-4">
            {currentFlat.blocks.map((block) => (
              <div
                key={block.id}
                className="rounded-xl bg-white p-5 sm:p-8 space-y-4"
              >
                {block.type === "text" && <TextBlock block={block} data={data} />}
                {block.type === "info" && <InfoBlock block={block} data={data} />}
                {block.type === "video" && <VideoBlock block={block} />}
                {block.type === "image" && <ImageBlock block={block} />}
                {block.type === "button" && <ButtonBlock block={block} />}
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
                {block.type === "media" && (
                  <MediaBlock
                    block={block}
                    token={token}
                    brandColor={brandColor}
                    existing={mediaUploaded[block.id]}
                    onUploaded={(ans) =>
                      setMediaUploaded((prev) => ({ ...prev, [block.id]: ans }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
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
            disabled={hasRequiredUnanswered || saving}
            className="flex-1 h-12 text-base font-medium"
            style={{ backgroundColor: brandColor }}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : currentIndex === totalLessons - 1 ? (
              "Завершить"
            ) : (
              <>
                Далее
                <ChevronRight className="ml-1 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Media recording block ───────────────────────────────────────────────────

const MAX_MEDIA_SIZE = 50 * 1024 * 1024

const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
]
const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
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

type MediaBlockMode = "idle" | "recording" | "preview" | "uploading" | "done" | "error"

function MediaBlock({
  block,
  token,
  brandColor,
  existing,
  onUploaded,
}: {
  block: Block
  token: string
  brandColor: string
  existing?: MediaAnswer
  onUploaded: (ans: MediaAnswer) => void
}) {
  const allowVideo = block.mediaAllowVideo ?? true
  const allowAudio = block.mediaAllowAudio ?? false
  const allowPhoto = block.mediaAllowPhoto ?? false
  const maxDuration = block.mediaMaxDuration === undefined ? 60 : block.mediaMaxDuration

  const [mode, setMode] = useState<MediaBlockMode>(existing ? "done" : "idle")
  const [recType, setRecType] = useState<"video" | "audio" | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMime, setPreviewMime] = useState<string>("")
  const [errMsg, setErrMsg] = useState("")
  const [result, setResult] = useState<MediaAnswer | null>(existing ?? null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)
  const blobMimeRef = useRef<string>("")
  const blobMediaTypeRef = useRef<"video" | "audio" | "photo">("video")
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Определяем, можно ли записывать через MediaRecorder — если нет, показываем file fallback
  const canRecordVideo = !!pickSupportedMime(VIDEO_MIME_CANDIDATES) && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  const canRecordAudio = !!pickSupportedMime(AUDIO_MIME_CANDIDATES) && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia

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
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRecording = async (type: "video" | "audio") => {
    setErrMsg("")
    try {
      const constraints: MediaStreamConstraints =
        type === "video"
          ? { audio: true, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } }
          : { audio: true, video: false }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (type === "video" && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        videoPreviewRef.current.muted = true
        videoPreviewRef.current.play().catch(() => {})
      }

      const mime = type === "video"
        ? pickSupportedMime(VIDEO_MIME_CANDIDATES)
        : pickSupportedMime(AUDIO_MIME_CANDIDATES)
      if (!mime) {
        setErrMsg("Браузер не поддерживает запись. Используйте загрузку файла.")
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
        setPreviewUrl(url)
        setPreviewMime(mime)
        setMode("preview")
        cleanup()
      }

      recorder.start()
      setRecType(type)
      setElapsed(0)
      setMode("recording")

      const startedAt = Date.now()
      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000
        setElapsed(secs)
        if (maxDuration !== null && secs >= maxDuration && recorder.state === "recording") {
          recorder.stop()
        }
      }, 200)
    } catch (err) {
      console.error("getUserMedia error", err)
      setErrMsg("Не удалось получить доступ к камере/микрофону. Разрешите доступ и попробуйте снова.")
      cleanup()
      setMode("idle")
    }
  }

  const stopRecording = () => {
    const rec = recorderRef.current
    if (rec && rec.state === "recording") rec.stop()
  }

  const resetToIdle = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewMime("")
    blobRef.current = null
    blobMimeRef.current = ""
    setElapsed(0)
    setErrMsg("")
    setRecType(null)
    setMode("idle")
  }

  const pickPhoto = (file: File) => {
    if (file.size > MAX_MEDIA_SIZE) {
      setErrMsg("Файл больше 50MB. Выберите файл поменьше.")
      return
    }
    blobRef.current = file
    blobMimeRef.current = file.type || "image/jpeg"
    blobMediaTypeRef.current = "photo"
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setPreviewMime(blobMimeRef.current)
    setErrMsg("")
    setMode("preview")
  }

  const pickVideoFile = (file: File) => {
    if (file.size > MAX_MEDIA_SIZE) {
      setErrMsg("Файл больше 50MB. Запишите короче или выберите другой файл.")
      return
    }
    blobRef.current = file
    blobMimeRef.current = file.type || "video/mp4"
    blobMediaTypeRef.current = "video"
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setPreviewMime(blobMimeRef.current)
    setErrMsg("")
    setMode("preview")
  }

  const upload = async () => {
    const blob = blobRef.current
    if (!blob) return
    if (blob.size > MAX_MEDIA_SIZE) {
      setErrMsg("Размер файла больше 50MB. Попробуйте записать короче.")
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

    const fd = new FormData()
    fd.append("file", fileObj)
    fd.append("blockId", block.id)
    fd.append("mediaType", mediaType)
    if (mediaType !== "photo") fd.append("duration", String(Math.round(elapsed)))

    try {
      const res = await fetch(`/api/public/demo/${token}/upload-media`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Ошибка загрузки")
      }
      const answer: MediaAnswer = {
        url: data.url,
        mediaType,
        duration: mediaType !== "photo" ? Math.round(elapsed) : undefined,
        size: blob.size,
        mime,
      }
      setResult(answer)
      onUploaded(answer)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setMode("done")
    } catch (err: any) {
      console.error("upload error", err)
      setErrMsg(err?.message || "Ошибка загрузки. Попробуйте ещё раз.")
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

      {errMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-3">
          {allowVideo && (
            canRecordVideo ? (
              <button
                onClick={() => startRecording("video")}
                className={`${bigBtnBase} bg-gray-900 text-white hover:bg-gray-800`}
              >
                <VideoIcon className={iconClass} />
                Записать видео
              </button>
            ) : (
              <>
                <button
                  onClick={() => document.getElementById(`${block.id}-videofile`)?.click()}
                  className={`${bigBtnBase} bg-gray-900 text-white hover:bg-gray-800`}
                >
                  <Upload className={iconClass} />
                  Загрузить видео
                </button>
                <input
                  id={`${block.id}-videofile`}
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
            )
          )}

          {allowAudio && canRecordAudio && (
            <button
              onClick={() => startRecording("audio")}
              className={`${bigBtnBase} bg-gray-900 text-white hover:bg-gray-800`}
            >
              <Mic className={iconClass} />
              Записать аудио
            </button>
          )}

          {allowPhoto && (
            <>
              <button
                onClick={() => photoInputRef.current?.click()}
                className={`${bigBtnBase} bg-gray-900 text-white hover:bg-gray-800`}
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
      )}

      {mode === "recording" && (
        <div className="space-y-3">
          {recType === "video" ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video ref={videoPreviewRef} playsInline className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-sm font-medium">REC</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 rounded-xl bg-gray-900">
              <div className="flex items-center gap-3 text-white">
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
              className="w-full rounded-xl bg-black aspect-video"
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
            <button
              onClick={upload}
              className={`${bigBtnBase} text-white flex-1`}
              style={{ backgroundColor: brandColor }}
            >
              <Send className={iconClass} />
              Отправить
            </button>
          </div>
        </div>
      )}

      {mode === "uploading" && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
          <span className="text-sm text-gray-700">Отправка…</span>
        </div>
      )}

      {mode === "done" && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>Отправлено</span>
          </div>
          {result.mediaType === "video" && (
            <video src={result.url} controls playsInline className="w-full rounded-xl bg-black aspect-video" />
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
