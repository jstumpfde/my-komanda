"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react"
import type { Block, Lesson, Question } from "@/lib/course-types"

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

function TextBlock({ block, data }: { block: Block; data: DemoData }) {
  const html = replaceVars(block.content, data)
    .replace(/\n/g, "<br/>")
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
  const html = replaceVars(block.content, data).replace(/\n/g, "<br/>")
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Курс не найден</h1>
          <p className="mt-2 text-gray-500">{error || "Проверьте ссылку и попробуйте снова"}</p>
        </div>
      </div>
    )
  }

  const brandColor = data.brandPrimaryColor || "#6366f1"

  // ─── Final screen ──────────────────────────────────────────────────────────

  if (finished) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: data.brandBgColor || "#f0f4ff" }}>
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: brandColor + "20" }}>
            <CheckCircle2 className="h-10 w-10" style={{ color: brandColor }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: data.brandTextColor || "#1e293b" }}>
            Спасибо за прохождение!
          </h1>
          <p className="text-gray-600">
            Вы завершили демонстрацию должности &laquo;{data.vacancyTitle}&raquo; в компании {data.companyName}.
            <br /><br />
            Мы проверим ваши ответы и свяжемся с вами в ближайшее время.
          </p>
          {data.companyLogo && (
            <img src={data.companyLogo} alt={data.companyName} className="mx-auto h-10 object-contain opacity-60" />
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
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: data.brandBgColor || "#f0f4ff" }}>
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
          <div className="rounded-xl bg-white p-5 sm:p-8 shadow-sm space-y-4">
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

      {/* Next button */}
      <div className="sticky bottom-0 border-t bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Button
            onClick={handleNext}
            disabled={hasRequiredUnanswered || saving}
            className="w-full h-12 text-base font-medium"
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
