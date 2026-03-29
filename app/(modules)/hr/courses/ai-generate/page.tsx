"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string
  options: string[]
  correct: number
}

interface Lesson {
  title: string
  content: string
  duration_minutes: number
  has_quiz: boolean
  quiz_questions: QuizQuestion[]
}

interface GeneratedCourse {
  title: string
  description: string
  category: string
  difficulty: string
  lessons: Lesson[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  onboarding: "Онбординг",
  product: "Продукт",
  sales: "Продажи",
  compliance: "Compliance",
  soft_skills: "Soft skills",
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Начальный",
  intermediate: "Средний",
  advanced: "Продвинутый",
}

const ACCEPTED_FORMATS = ".pdf,.docx,.pptx,.txt,.md"

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, current }: { step: number; current: number }) {
  const done = current > step
  const active = current === step
  return (
    <div className={cn(
      "flex items-center justify-center size-8 rounded-full text-sm font-medium border-2 transition-colors",
      done && "bg-green-500 border-green-500 text-white",
      active && "border-violet-600 text-violet-600 bg-violet-50",
      !done && !active && "border-muted text-muted-foreground"
    )}>
      {done ? <CheckCircle2 className="size-4" /> : step}
    </div>
  )
}

// ─── Lesson card ──────────────────────────────────────────────────────────────

function LessonCard({
  lesson,
  index,
  onChange,
  onDelete,
}: {
  lesson: Lesson
  index: number
  onChange: (updated: Lesson) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="border">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <Input
              value={lesson.title}
              onChange={e => onChange({ ...lesson, title: e.target.value })}
              className="h-7 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 font-medium"
              placeholder="Название урока"
            />
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {lesson.duration_minutes} мин
          </Badge>
          {lesson.has_quiz && (
            <Badge variant="secondary" className="text-xs shrink-0">Тест</Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        {!expanded && lesson.content && (
          <p className="text-xs text-muted-foreground ml-8 truncate">
            {lesson.content.replace(/#+\s/g, "").slice(0, 100)}
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Содержание (Markdown)</Label>
            <Textarea
              value={lesson.content}
              onChange={e => onChange({ ...lesson, content: e.target.value })}
              rows={5}
              className="text-xs font-mono"
              placeholder="Содержание урока в формате Markdown..."
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Длительность (мин)</Label>
              <Input
                type="number"
                value={lesson.duration_minutes}
                onChange={e => onChange({ ...lesson, duration_minutes: Number(e.target.value) })}
                className="h-8 w-20 text-sm"
                min={1}
                max={120}
              />
            </div>
          </div>
          {lesson.quiz_questions?.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Вопросы теста</Label>
              {lesson.quiz_questions.map((q, qi) => (
                <div key={qi} className="text-xs text-muted-foreground bg-muted rounded p-2">
                  <p className="font-medium text-foreground">{qi + 1}. {q.question}</p>
                  <ul className="mt-1 space-y-0.5">
                    {q.options.map((opt, oi) => (
                      <li key={oi} className={cn(oi === q.correct && "text-green-700 font-medium")}>
                        {["А", "Б", "В", "Г"][oi]}. {opt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiGeneratePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 1
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [charCount, setCharCount] = useState(0)

  // Step 2
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Step 3
  const [course, setCourse] = useState<GeneratedCourse | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ─── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback((selectedFile: File) => {
    setFile(selectedFile)
    setUploadError(null)
    setExtractedText(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) handleFile(dropped)
    },
    [handleFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) handleFile(selected)
    },
    [handleFile]
  )

  // ─── Step 1: Upload ─────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/modules/hr/courses/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error || "Ошибка загрузки файла")
        return
      }

      setExtractedText(data.text)
      setCharCount(data.charCount)

      // Automatically go to step 2 and start generation
      setStep(2)
      handleGenerate(data.text)
    } catch {
      setUploadError("Не удалось загрузить файл")
    } finally {
      setUploading(false)
    }
  }

  // ─── Step 2: Generate ───────────────────────────────────────────────────────

  async function handleGenerate(text: string) {
    setGenerating(true)
    setGenError(null)

    try {
      const res = await fetch("/api/modules/hr/courses/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename: file?.name }),
      })

      const data = await res.json()

      if (!res.ok) {
        setGenError(data.error || "Ошибка генерации")
        return
      }

      setCourse(data)
      setStep(3)
    } catch {
      setGenError("Не удалось сгенерировать курс")
    } finally {
      setGenerating(false)
    }
  }

  // ─── Step 3: Save ───────────────────────────────────────────────────────────

  async function handleSave() {
    if (!course) return
    setSaving(true)
    setSaveError(null)

    try {
      // Сохраняем курс
      const courseRes = await fetch("/api/modules/hr/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: course.title,
          description: course.description,
          category: course.category,
          difficulty: course.difficulty,
          durationMin: course.lessons.reduce((sum, l) => sum + l.duration_minutes, 0),
        }),
      })

      if (!courseRes.ok) {
        const err = await courseRes.json()
        setSaveError(err.error || "Ошибка сохранения курса")
        return
      }

      const savedCourse = await courseRes.json()

      // Сохраняем уроки
      for (let i = 0; i < course.lessons.length; i++) {
        const lesson = course.lessons[i]
        await fetch(`/api/modules/hr/courses/${savedCourse.id}/lessons`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: lesson.title,
            type: lesson.has_quiz ? "quiz" : "content",
            content: {
              markdown: lesson.content,
              quiz: lesson.has_quiz ? lesson.quiz_questions : undefined,
            },
            durationMin: lesson.duration_minutes,
            sortOrder: i,
          }),
        })
      }

      // Переходим на страницу курса
      router.push(`/hr/courses/${savedCourse.id}/edit`)
    } catch {
      setSaveError("Не удалось сохранить курс")
    } finally {
      setSaving(false)
    }
  }

  function addLesson() {
    if (!course) return
    setCourse({
      ...course,
      lessons: [
        ...course.lessons,
        {
          title: "Новый урок",
          content: "",
          duration_minutes: 15,
          has_quiz: false,
          quiz_questions: [],
        },
      ],
    })
  }

  function updateLesson(index: number, updated: Lesson) {
    if (!course) return
    const lessons = [...course.lessons]
    lessons[index] = updated
    setCourse({ ...course, lessons })
  }

  function deleteLesson(index: number) {
    if (!course) return
    setCourse({ ...course, lessons: course.lessons.filter((_, i) => i !== index) })
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="p-6 max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <Link href="/hr/courses">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold">AI-генерация курса</h1>
              <p className="text-sm text-muted-foreground">Загрузите документ — AI создаст структуру курса</p>
            </div>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-3">
            <StepIndicator step={1} current={step} />
            <span className={cn("text-sm", step === 1 ? "font-medium" : "text-muted-foreground")}>
              Загрузка документа
            </span>
            <div className="flex-1 h-px bg-border" />
            <StepIndicator step={2} current={step} />
            <span className={cn("text-sm", step === 2 ? "font-medium" : "text-muted-foreground")}>
              Генерация
            </span>
            <div className="flex-1 h-px bg-border" />
            <StepIndicator step={3} current={step} />
            <span className={cn("text-sm", step === 3 ? "font-medium" : "text-muted-foreground")}>
              Предпросмотр
            </span>
          </div>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Drop zone */}
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
                    dragOver
                      ? "border-violet-500 bg-violet-50"
                      : "border-muted-foreground/30 hover:border-violet-400 hover:bg-muted/50"
                  )}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">
                    {file ? file.name : "Перетащите файл или нажмите для выбора"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOCX, PPTX, TXT, MD — до 10 МБ
                  </p>
                  {file && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Размер: {formatSize(file.size)}
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FORMATS}
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </div>

                {/* Extracted text preview */}
                {extractedText && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Извлечённый текст</Label>
                      <span className="text-xs text-muted-foreground">{charCount.toLocaleString()} символов</span>
                    </div>
                    <div className="bg-muted rounded p-3 text-xs text-muted-foreground font-mono leading-relaxed max-h-28 overflow-hidden">
                      {extractedText.slice(0, 200)}
                      {extractedText.length > 200 && "..."}
                    </div>
                  </div>
                )}

                {/* Error */}
                {uploadError && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{uploadError}</AlertDescription>
                  </Alert>
                )}

                {/* Button */}
                <Button
                  className="w-full"
                  disabled={!file || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Извлечение текста...
                    </>
                  ) : (
                    <>
                      <FileText className="size-4 mr-2" />
                      Извлечь текст
                    </>
                  )}
                </Button>

                {uploading && (
                  <Progress value={undefined} className="h-1" />
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                  <div className="relative">
                    <Sparkles className="size-12 text-violet-500" />
                    {generating && (
                      <Loader2 className="size-5 text-violet-400 animate-spin absolute -top-1 -right-1" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">AI генерирует структуру курса...</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Это займёт около 15–30 секунд
                    </p>
                  </div>

                  {genError && (
                    <Alert variant="destructive" className="max-w-sm text-left">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{genError}</AlertDescription>
                    </Alert>
                  )}

                  {genError && extractedText && (
                    <Button
                      variant="outline"
                      onClick={() => handleGenerate(extractedText)}
                      disabled={generating}
                    >
                      Попробовать снова
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && course && (
            <div className="space-y-4">
              {/* Course metadata */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Информация о курсе</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Название *</Label>
                    <Input
                      value={course.title}
                      onChange={e => setCourse({ ...course, title: e.target.value })}
                      placeholder="Название курса"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Описание</Label>
                    <Textarea
                      value={course.description}
                      onChange={e => setCourse({ ...course, description: e.target.value })}
                      rows={3}
                      placeholder="Описание курса"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Категория</Label>
                      <Select
                        value={course.category}
                        onValueChange={v => setCourse({ ...course, category: v })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Уровень</Label>
                      <Select
                        value={course.difficulty}
                        onValueChange={v => setCourse({ ...course, difficulty: v })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Lessons */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium text-sm">
                    Уроки
                    <span className="ml-2 text-muted-foreground font-normal">
                      ({course.lessons.length})
                    </span>
                  </h2>
                  <Button variant="outline" size="sm" onClick={addLesson}>
                    <Plus className="size-3.5 mr-1" />
                    Добавить урок
                  </Button>
                </div>

                {course.lessons.map((lesson, index) => (
                  <LessonCard
                    key={index}
                    lesson={lesson}
                    index={index}
                    onChange={updated => updateLesson(index, updated)}
                    onDelete={() => deleteLesson(index)}
                  />
                ))}
              </div>

              {/* Save error */}
              {saveError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" asChild>
                  <Link href="/hr/courses">Отмена</Link>
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={saving || !course.title.trim()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 mr-2" />
                      Создать курс как черновик
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
