"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Upload, FileText, Sparkles, CheckCircle2, AlertCircle,
  Plus, Trash2, ChevronDown, ChevronUp, Loader2, X, BookOpen,
  Youtube, Type, Link2, RefreshCw, FolderOpen, Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string
  options: string[]
  correct: number
}

interface GeneratedLesson {
  title: string
  content: string
  duration_minutes: number
  has_quiz: boolean
  quiz_questions: QuizQuestion[]
}

interface GeneratedModule {
  title: string
  description: string
  lessons: GeneratedLesson[]
}

interface GeneratedCourse {
  title: string
  description: string
  category: string
  difficulty: string
  modules: GeneratedModule[]
  // flat lessons for backwards compat
  lessons?: GeneratedLesson[]
}

interface SourceItem {
  id: string
  type: "article" | "youtube" | "file" | "text"
  title: string
  subtitle?: string
  meta?: string
  // data
  articleId?: string
  videoUrl?: string
  fileName?: string
  fileSize?: number
  textContent?: string
  wordCount?: number
}

interface KnowledgeArticle {
  id: string
  slug: string
  title: string
  category: string
  categorySlug: string
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
  { value: "mini",     label: "Мини-курс ~15 мин",        desc: "3-5 коротких уроков" },
  { value: "standard", label: "Стандартный 1-2 часа",     desc: "8-12 уроков с тестами" },
  { value: "full",     label: "Полный курс 4+ часов",     desc: "15-25 уроков, модули" },
]

const TONE_OPTIONS = [
  { value: "formal",    label: "Формальный" },
  { value: "friendly",  label: "Дружелюбный" },
  { value: "gamified",  label: "Игровой" },
]

const PROGRESS_STAGES = [
  "Анализ материалов...",
  "Создание структуры...",
  "Генерация уроков...",
  "Создание тестов...",
  "Финализация...",
]

// Mock articles for the knowledge picker
const MOCK_ARTICLES: KnowledgeArticle[] = [
  { id: "1", slug: "kak-oformit-otpusk",         title: "Как оформить отпуск",           category: "HR-политики",       categorySlug: "hr-policies" },
  { id: "2", slug: "nastroyka-vpn",               title: "Настройка VPN",                 category: "IT и безопасность", categorySlug: "it-security" },
  { id: "3", slug: "skript-kholodnogo-zvonka-v2", title: "Скрипт холодного звонка v2",    category: "Продажи",           categorySlug: "sales" },
  { id: "4", slug: "chek-list-pervogo-dnya",       title: "Чек-лист первого дня",         category: "Онбординг",         categorySlug: "onboarding" },
  { id: "5", slug: "kak-zakazat-kantstovary",     title: "Как заказать канцтовары",       category: "Регламенты",        categorySlug: "regulations" },
  { id: "6", slug: "rabota-s-crm",                title: "Работа с CRM",                  category: "Продажи",           categorySlug: "sales" },
  { id: "7", slug: "paroli-i-2fa",                title: "Пароли и двухфакторная защита", category: "IT и безопасность", categorySlug: "it-security" },
  { id: "8", slug: "obrabotka-vozrazheniy",       title: "Обработка возражений",          category: "Продажи",           categorySlug: "sales" },
  { id: "9", slug: "struktura-kompanii",          title: "Структура компании",            category: "Онбординг",         categorySlug: "onboarding" },
  { id: "10", slug: "kpi-i-bonusy",               title: "KPI и бонусы",                  category: "HR-политики",       categorySlug: "hr-policies" },
]

const ACCEPTED_FILE_FORMATS = ".pdf,.docx,.pptx,.txt,.md"

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ─── Source chip ──────────────────────────────────────────────────────────────

function SourceChip({ item, onRemove }: { item: SourceItem; onRemove: () => void }) {
  const icons: Record<string, React.ReactNode> = {
    article: <BookOpen className="size-3.5 text-violet-600" />,
    youtube: <Youtube className="size-3.5 text-red-600" />,
    file: <FileText className="size-3.5 text-blue-600" />,
    text: <Type className="size-3.5 text-emerald-600" />,
  }
  const bgs: Record<string, string> = {
    article: "bg-violet-50 border-violet-200",
    youtube: "bg-red-50 border-red-200",
    file: "bg-blue-50 border-blue-200",
    text: "bg-emerald-50 border-emerald-200",
  }

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm", bgs[item.type])}>
      {icons[item.type]}
      <span className="truncate max-w-[200px] font-medium text-xs">{item.title}</span>
      {item.meta && <span className="text-[10px] text-muted-foreground">{item.meta}</span>}
      <button type="button" onClick={onRemove} className="ml-0.5 hover:text-destructive transition-colors">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

// ─── Course tree preview ─────────────────────────────────────────────────────

function CourseTree({ course }: { course: GeneratedCourse }) {
  const modules = course.modules ?? [{ title: "Основной модуль", description: "", lessons: course.lessons ?? [] }]
  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0)
  const totalMin = modules.reduce((s, m) => s + m.lessons.reduce((ls, l) => ls + l.duration_minutes, 0), 0)
  const totalQuizzes = modules.reduce((s, m) => s + m.lessons.filter((l) => l.has_quiz).length, 0)

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{totalLessons} уроков</span>
        <span>{Math.floor(totalMin / 60) > 0 ? `${Math.floor(totalMin / 60)} ч ` : ""}{totalMin % 60} мин</span>
        <span>{totalQuizzes} тестов</span>
      </div>

      {/* Tree */}
      {modules.map((mod, mi) => (
        <div key={mi} className="space-y-1">
          {modules.length > 1 && (
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderOpen className="size-4 text-violet-500" />
              <span>Модуль {mi + 1}: {mod.title}</span>
            </div>
          )}
          <div className={cn("space-y-0.5", modules.length > 1 && "ml-6")}>
            {mod.lessons.map((lesson, li) => (
              <div key={li} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted/50">
                <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{li + 1}</span>
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{lesson.title}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{lesson.duration_minutes} мин</Badge>
                {lesson.has_quiz && <Badge variant="secondary" className="text-[10px] shrink-0">Тест</Badge>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AiGeneratePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sources
  const [sources, setSources] = useState<SourceItem[]>([])
  const [showArticlePicker, setShowArticlePicker] = useState(false)
  const [articleSearch, setArticleSearch] = useState("")
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [pasteText, setPasteText] = useState("")
  const [dragOver, setDragOver] = useState(false)

  // Settings
  const [courseTitle, setCourseTitle] = useState("")
  const [audience, setAudience] = useState("new_employees")
  const [format, setFormat] = useState("standard")
  const [tone, setTone] = useState("friendly")
  const [withTests, setWithTests] = useState(true)
  const [withSummary, setWithSummary] = useState(true)

  // Generation
  const [generating, setGenerating] = useState(false)
  const [genStage, setGenStage] = useState(0)
  const [genProgress, setGenProgress] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
  const [course, setCourse] = useState<GeneratedCourse | null>(null)

  // Save
  const [saving, setSaving] = useState(false)

  // ─── Source management ───────────────────────────────────────────────────────

  const removeSource = (id: string) => setSources((prev) => prev.filter((s) => s.id !== id))

  // Articles
  const handleConfirmArticles = () => {
    const newSources = selectedArticleIds
      .filter((aid) => !sources.some((s) => s.articleId === aid))
      .map((aid) => {
        const article = MOCK_ARTICLES.find((a) => a.id === aid)!
        return {
          id: `src-article-${aid}`,
          type: "article" as const,
          title: article.title,
          subtitle: article.category,
          articleId: aid,
        }
      })
    setSources((prev) => [...prev, ...newSources])
    setShowArticlePicker(false)
  }

  // YouTube
  const handleAddYoutube = () => {
    const url = youtubeUrl.trim()
    if (!url) return
    // Extract video ID for title
    const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/)
    const videoId = match?.[1] ?? "video"
    setSources((prev) => [
      ...prev,
      {
        id: `src-yt-${Date.now()}`,
        type: "youtube",
        title: `YouTube: ${videoId}`,
        meta: "видео",
        videoUrl: url,
      },
    ])
    setYoutubeUrl("")
  }

  // Files
  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      setSources((prev) => [
        ...prev,
        {
          id: `src-file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          type: "file",
          title: file.name,
          meta: formatSize(file.size),
          fileName: file.name,
          fileSize: file.size,
        },
      ])
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [])

  // Text
  const handleAddText = () => {
    const text = pasteText.trim()
    if (!text) return
    const wc = wordCount(text)
    setSources((prev) => [
      ...prev,
      {
        id: `src-text-${Date.now()}`,
        type: "text",
        title: `Текст (${wc} слов)`,
        meta: `${wc} слов`,
        textContent: text,
        wordCount: wc,
      },
    ])
    setPasteText("")
  }

  // ─── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (sources.length === 0) return
    setGenerating(true)
    setGenError(null)
    setCourse(null)
    setGenStage(0)
    setGenProgress(0)

    // Animate progress
    const interval = setInterval(() => {
      setGenProgress((prev) => {
        if (prev >= 95) { clearInterval(interval); return 95 }
        return prev + Math.random() * 8
      })
      setGenStage((prev) => {
        const next = prev + 1
        return next < PROGRESS_STAGES.length ? next : prev
      })
    }, 2500)

    try {
      // Collect all file data as base64
      const filePromises = sources
        .filter((s) => s.type === "file")
        .map(async (s) => {
          // In real app, we'd read the file; here we just send the filename
          return { name: s.fileName!, size: s.fileSize ?? 0 }
        })
      await Promise.all(filePromises)

      const res = await fetch("/api/modules/hr/courses/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleIds: sources.filter((s) => s.type === "article").map((s) => s.articleId),
          videoUrls: sources.filter((s) => s.type === "youtube").map((s) => s.videoUrl),
          texts: sources.filter((s) => s.type === "text").map((s) => s.textContent),
          fileNames: sources.filter((s) => s.type === "file").map((s) => s.fileName),
          params: {
            title: courseTitle.trim() || undefined,
            audience,
            format,
            tone,
            withTests,
            withSummary,
          },
        }),
      })

      clearInterval(interval)
      setGenProgress(100)

      const data = await res.json()
      if (!res.ok) {
        setGenError(data.error || "Ошибка генерации")
        return
      }

      setCourse(data)
    } catch {
      setGenError("Не удалось сгенерировать курс. Попробуйте ещё раз.")
    } finally {
      clearInterval(interval)
      setGenerating(false)
    }
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!course) return
    setSaving(true)

    try {
      // Create course
      const courseRes = await fetch("/api/modules/hr/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: course.title,
          description: course.description,
          category: course.category ?? "onboarding",
          difficulty: course.difficulty ?? "beginner",
          durationMin: (course.modules ?? [{ lessons: course.lessons ?? [] }])
            .reduce((s, m) => s + m.lessons.reduce((ls, l) => ls + l.duration_minutes, 0), 0),
        }),
      })

      if (!courseRes.ok) {
        const err = await courseRes.json()
        setGenError(err.error || "Ошибка сохранения курса")
        return
      }

      const savedCourse = await courseRes.json()

      // Save lessons
      const allLessons = (course.modules ?? [{ lessons: course.lessons ?? [], title: "", description: "" }])
        .flatMap((m) => m.lessons)

      for (let i = 0; i < allLessons.length; i++) {
        const lesson = allLessons[i]
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

      router.push(`/hr/courses/${savedCourse.id}/edit`)
    } catch {
      setGenError("Не удалось сохранить курс")
    } finally {
      setSaving(false)
    }
  }

  // ─── Filtered articles for picker ──────────────────────────────────────────

  const filteredArticles = MOCK_ARTICLES.filter((a) =>
    !articleSearch || a.title.toLowerCase().includes(articleSearch.toLowerCase()) || a.category.toLowerCase().includes(articleSearch.toLowerCase())
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          {/* Header */}
          <div className="border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <Link href="/hr/courses"><ArrowLeft className="size-4" /></Link>
              </Button>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <Sparkles className="size-5 text-violet-500" />
                  AI-генератор курсов
                </h1>
                <p className="text-sm text-muted-foreground">
                  Соберите материалы из разных источников — AI создаст структурированный курс
                </p>
              </div>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="flex min-h-[calc(100vh-180px)]">

            {/* ═══ LEFT PANEL — Sources ═══ */}
            <div className="w-[40%] border-r flex flex-col">
              <div className="px-5 py-4 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Материалы для курса</h2>
                  <Badge variant="secondary" className="text-xs">
                    {sources.length} {sources.length === 1 ? "источник" : sources.length < 5 ? "источника" : "источников"}
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-5 space-y-5">

                {/* 1. Из базы знаний */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Из базы знаний</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 w-full justify-start"
                    onClick={() => {
                      setSelectedArticleIds(sources.filter((s) => s.type === "article").map((s) => s.articleId!))
                      setShowArticlePicker(true)
                    }}
                  >
                    <BookOpen className="size-4 text-violet-500" />
                    Выбрать статьи
                  </Button>
                </div>

                {/* 2. YouTube видео */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">YouTube видео</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Youtube className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-red-500" />
                      <Input
                        placeholder="https://youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddYoutube()}
                        className="h-9 pl-9 text-sm"
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={handleAddYoutube} disabled={!youtubeUrl.trim()} className="shrink-0">
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* 3. Загрузить файлы */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Загрузить файлы</Label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                      dragOver ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-muted/30",
                    )}
                  >
                    <Upload className="size-6 text-muted-foreground mx-auto mb-1.5" />
                    <p className="text-xs font-medium">Перетащите или <span className="text-primary">выберите</span></p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">DOCX, PDF, TXT, MD, PPTX — до 50 МБ</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_FILE_FORMATS}
                      multiple
                      onChange={(e) => { handleFiles(e.target.files); e.target.value = "" }}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* 4. Вставить текст */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Вставить текст</Label>
                  <Textarea
                    placeholder="Скопируйте и вставьте текст из любого источника..."
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  {pasteText.trim() && (
                    <Button size="sm" variant="outline" onClick={handleAddText} className="gap-1 w-full">
                      <Plus className="size-3.5" />
                      Добавить ({wordCount(pasteText)} слов)
                    </Button>
                  )}
                </div>

                {/* Source chips */}
                {sources.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Добавленные источники</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {sources.map((s) => (
                        <SourceChip key={s.id} item={s} onRemove={() => removeSource(s.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═══ RIGHT PANEL — Settings & Result ═══ */}
            <div className="w-[60%] flex flex-col">
              {!course ? (
                /* Settings */
                <div className="flex-1 overflow-auto p-6 space-y-5">
                  <h2 className="text-sm font-semibold">Настройки генерации</h2>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Название курса</Label>
                    <Input
                      placeholder="AI придумает название если оставить пустым"
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Целевая аудитория</Label>
                      <Select value={audience} onValueChange={setAudience}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Тон</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Формат курса</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {FORMAT_OPTIONS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setFormat(f.value)}
                          className={cn(
                            "p-3 rounded-lg border text-left transition-all",
                            format === f.value
                              ? "border-violet-400 bg-violet-50"
                              : "border-border hover:border-foreground/20",
                          )}
                        >
                          <p className="text-sm font-medium">{f.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="withTests" checked={withTests} onCheckedChange={(v) => setWithTests(v === true)} />
                      <Label htmlFor="withTests" className="font-normal cursor-pointer text-sm">
                        Генерировать тесты после каждого урока
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="withSummary" checked={withSummary} onCheckedChange={(v) => setWithSummary(v === true)} />
                      <Label htmlFor="withSummary" className="font-normal cursor-pointer text-sm">
                        Генерировать конспект
                      </Label>
                    </div>
                  </div>

                  {/* Generate button */}
                  <div className="pt-2">
                    <Button
                      size="lg"
                      className="w-full gap-2 h-12 text-base"
                      disabled={sources.length === 0 || generating}
                      onClick={handleGenerate}
                    >
                      {generating ? (
                        <>
                          <Loader2 className="size-5 animate-spin" />
                          Генерация...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-5" />
                          Сгенерировать курс
                        </>
                      )}
                    </Button>
                    {sources.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Добавьте хотя бы один источник в левой панели
                      </p>
                    )}
                  </div>

                  {/* Progress */}
                  {generating && (
                    <div className="space-y-3 p-4 rounded-xl bg-violet-50/50 border border-violet-200">
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin text-violet-600" />
                        <span className="text-sm font-medium text-violet-900">
                          {PROGRESS_STAGES[genStage]}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-violet-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-1000 ease-out"
                          style={{ width: `${genProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-violet-600">Это займёт 15-30 секунд</p>
                    </div>
                  )}

                  {genError && !course && (
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{genError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                /* Result preview */
                <div className="flex-1 overflow-auto p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      Курс сгенерирован
                    </h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => { setCourse(null); handleGenerate() }}
                        disabled={generating}
                      >
                        <RefreshCw className="size-3.5" />
                        Перегенерировать
                      </Button>
                    </div>
                  </div>

                  {/* Course info */}
                  <div className="space-y-3 p-4 rounded-xl border bg-card">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Название</Label>
                      <Input
                        value={course.title}
                        onChange={(e) => setCourse({ ...course, title: e.target.value })}
                        className="h-10 text-base font-semibold border-0 bg-transparent p-0 focus-visible:ring-0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Описание</Label>
                      <Textarea
                        value={course.description}
                        onChange={(e) => setCourse({ ...course, description: e.target.value })}
                        rows={2}
                        className="text-sm border-0 bg-transparent p-0 focus-visible:ring-0 resize-none"
                      />
                    </div>
                  </div>

                  {/* Course tree */}
                  <div className="space-y-2 p-4 rounded-xl border bg-card">
                    <h3 className="text-sm font-semibold">Структура курса</h3>
                    <CourseTree course={course} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button variant="outline" onClick={() => setCourse(null)}>
                      Отмена
                    </Button>
                    <Button
                      className="flex-1 gap-2"
                      onClick={handleSave}
                      disabled={saving || !course.title.trim()}
                    >
                      {saving ? (
                        <><Loader2 className="size-4 animate-spin" />Сохранение...</>
                      ) : (
                        <><CheckCircle2 className="size-4" />Создать курс</>
                      )}
                    </Button>
                  </div>

                  {genError && (
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{genError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Article picker dialog */}
      <Dialog open={showArticlePicker} onOpenChange={setShowArticlePicker}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Выбрать статьи из базы знаний</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию или категории..."
              value={articleSearch}
              onChange={(e) => setArticleSearch(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <div className="flex-1 overflow-auto -mx-6 px-6 space-y-0.5 max-h-[400px]">
            {filteredArticles.map((a) => {
              const checked = selectedArticleIds.includes(a.id)
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                    checked ? "bg-violet-50" : "hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      if (v) setSelectedArticleIds((p) => [...p, a.id])
                      else setSelectedArticleIds((p) => p.filter((x) => x !== a.id))
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.category}</p>
                  </div>
                </label>
              )
            })}
            {filteredArticles.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</div>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">
              Выбрано: {selectedArticleIds.length}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowArticlePicker(false)}>Отмена</Button>
              <Button onClick={handleConfirmArticles} disabled={selectedArticleIds.length === 0}>
                Добавить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
