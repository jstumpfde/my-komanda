"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react"
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

interface FlatBlock {
  block: Block
  lessonTitle: string
  lessonEmoji: string
  globalIndex: number
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

// ─── Flatten lessons into sequential blocks ──────────────────────────────────

function flattenLessons(lessons: Lesson[]): FlatBlock[] {
  const flat: FlatBlock[] = []
  let idx = 0
  for (const lesson of lessons) {
    for (const block of lesson.blocks) {
      flat.push({ block, lessonTitle: lesson.title, lessonEmoji: lesson.emoji, globalIndex: idx++ })
    }
  }
  return flat
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
          // Restore progress
          if (d.progress?.currentBlock) {
            setCurrentIndex(d.progress.currentBlock)
          }
          // Restore answers
          if (d.answers) {
            const restored: Record<string, Record<string, string>> = {}
            for (const a of d.answers) {
              if (typeof a.answer === "object" && a.answer !== null) {
                restored[a.blockId] = a.answer
              }
            }
            setTaskAnswers(restored)
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

  const flatBlocks = data ? flattenLessons(data.lessons) : []
  const totalBlocks = flatBlocks.length
  const currentFlat = flatBlocks[currentIndex]
  const progressPercent = totalBlocks > 0 ? ((currentIndex + 1) / totalBlocks) * 100 : 0

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
          currentBlock: currentIndex,
          totalBlocks,
        }),
      })
    } catch {
      // silently fail — answers are best-effort
    }
  }, [token, currentIndex, totalBlocks])

  const handleNext = useCallback(async () => {
    if (!currentFlat) return

    const block = currentFlat.block

    // If task block, validate required questions and save answers
    if (block.type === "task" && block.questions.length > 0) {
      const answers = taskAnswers[block.id] || {}
      const requiredMissing = block.questions.some(
        (q) => q.required && !answers[q.id]?.trim()
      )
      if (requiredMissing) return // don't advance if required questions unanswered

      setSaving(true)
      await saveAnswer(block.id, answers)
      setSaving(false)
    }

    blockStartTime.current = Date.now()

    if (currentIndex < totalBlocks - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      setFinished(true)
      // Save final progress
      await saveAnswer("__complete__", { completed: true })
    }
  }, [currentFlat, currentIndex, totalBlocks, taskAnswers, saveAnswer])

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

  const block = currentFlat.block
  const isTask = block.type === "task" && block.questions.length > 0
  const currentTaskAnswers = taskAnswers[block.id] || {}
  const hasRequiredUnanswered = isTask && block.questions.some(
    (q) => q.required && !currentTaskAnswers[q.id]?.trim()
  )

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
              {currentIndex + 1} из {totalBlocks}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          {/* Lesson header */}
          <div className="mb-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              {currentFlat.lessonEmoji} {currentFlat.lessonTitle}
            </span>
          </div>

          {/* Block content */}
          <div className="rounded-xl bg-white p-5 sm:p-8 space-y-4">
            {block.type === "text" && <TextBlock block={block} data={data} />}
            {block.type === "info" && <InfoBlock block={block} data={data} />}
            {block.type === "video" && <VideoBlock block={block} />}
            {block.type === "image" && <ImageBlock block={block} />}
            {block.type === "button" && <ButtonBlock block={block} />}
            {block.type === "task" && (
              <TaskBlock
                block={block}
                data={data}
                answers={currentTaskAnswers}
                onAnswersChange={(a) => setTaskAnswers((prev) => ({ ...prev, [block.id]: a }))}
              />
            )}
            {block.type === "audio" && block.audioUrl && (
              <div className="space-y-2">
                {block.audioTitle && <p className="font-medium text-gray-800">{block.audioTitle}</p>}
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
                <span className="font-medium text-gray-700">{block.fileName || "Скачать файл"}</span>
              </a>
            )}
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
            ) : currentIndex === totalBlocks - 1 ? (
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
