"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { NotionEditor, type NotionEditorHandle } from "@/components/vacancies/notion-editor"
import { QuizEditor, type QuizQuestion } from "@/components/knowledge/quiz-editor"
import {
  ChevronRight, Save, Send, Plus, X, UserPlus, Link2, Upload, FileText,
  Loader2, CheckCircle2, ExternalLink, GripVertical, Trash2, ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Demo, Lesson } from "@/lib/course-types"
import { createBlock } from "@/lib/course-types"

// ─── Mock data ──────────────────────────────────────────────────────────────

const INITIAL_CATEGORIES = [
  { value: "onboarding",   label: "Онбординг" },
  { value: "regulations",  label: "Регламенты" },
  { value: "it-security",  label: "IT и безопасность" },
  { value: "hr-policies",  label: "HR-политики" },
  { value: "sales",        label: "Продажи" },
  { value: "learning",     label: "Обучение" },
]

const MOCK_REVIEWERS = [
  { id: "r1", name: "Анна Иванова",    role: "HR-руководитель" },
  { id: "r2", name: "Дмитрий Козлов",  role: "IT-директор" },
  { id: "r3", name: "Сергей Волков",   role: "Руководитель продаж" },
  { id: "r4", name: "Елена Сидорова",  role: "Операционный директор" },
]

const MOCK_EMPLOYEES = [
  { id: "e1", name: "Анна Иванова",    initials: "АИ", color: "#8b5cf6", role: "HR-руководитель" },
  { id: "e2", name: "Дмитрий Козлов",  initials: "ДК", color: "#3b82f6", role: "IT-директор" },
  { id: "e3", name: "Сергей Волков",   initials: "СВ", color: "#f59e0b", role: "Руководитель продаж" },
  { id: "e4", name: "Елена Сидорова",  initials: "ЕС", color: "#10b981", role: "Операционный директор" },
  { id: "e5", name: "Мария Петрова",   initials: "МП", color: "#ef4444", role: "HR-менеджер" },
  { id: "e6", name: "Алексей Смирнов", initials: "АС", color: "#6366f1", role: "Тимлид" },
]

function createInitialDemo(): Demo {
  return {
    id: `article-${Date.now()}`,
    title: "Новая статья",
    companyName: "",
    description: "",
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    coverGradientFrom: "#fef3c7",
    coverGradientTo: "#fde68a",
    lessons: [
      {
        id: `lesson-${Date.now()}`,
        emoji: "📄",
        title: "Основной раздел",
        blocks: [createBlock("text")],
      },
    ],
  }
}

// ─── Import sources ─────────────────────────────────────────────────────────

const IMPORT_SOURCES = [
  {
    id: "notion",
    name: "Notion",
    icon: "📝",
    color: "#000000",
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    desc: "Импорт страниц из Notion",
    placeholder: "https://www.notion.so/your-page-id...",
    accept: ".html,.md,.csv",
    fileHint: "HTML-экспорт из Notion",
  },
  {
    id: "ispring",
    name: "iSpring",
    icon: "🎓",
    color: "#FF6B00",
    bg: "bg-orange-50",
    border: "border-orange-200",
    desc: "Курсы и тесты из iSpring",
    placeholder: "https://mycompany.ispringlearn.ru/content/...",
    accept: ".html,.zip,.scorm,.pptx",
    fileHint: "SCORM-пакет, HTML или PPTX",
  },
  {
    id: "platrum",
    name: "Platrum",
    icon: "📚",
    color: "#6C5CE7",
    bg: "bg-violet-50",
    border: "border-violet-200",
    desc: "Базы знаний из Platrum",
    placeholder: "https://app.platrum.ru/knowledge/...",
    accept: ".html,.pdf,.docx",
    fileHint: "HTML-экспорт или PDF",
  },
  {
    id: "confluence",
    name: "Confluence",
    icon: "🔷",
    color: "#0052CC",
    bg: "bg-blue-50",
    border: "border-blue-200",
    desc: "Страницы из Confluence / Jira",
    placeholder: "https://your-domain.atlassian.net/wiki/...",
    accept: ".html,.pdf,.docx,.xml",
    fileHint: "HTML или XML-экспорт",
  },
  {
    id: "google",
    name: "Google Docs",
    icon: "📄",
    color: "#4285F4",
    bg: "bg-blue-50",
    border: "border-blue-200",
    desc: "Документы Google Docs",
    placeholder: "https://docs.google.com/document/d/...",
    accept: ".html,.docx,.pdf",
    fileHint: "DOCX или HTML-экспорт",
  },
  {
    id: "file",
    name: "Файл",
    icon: "📎",
    color: "#64748b",
    bg: "bg-slate-50",
    border: "border-slate-200",
    desc: "DOCX, PDF, HTML, Markdown",
    placeholder: "",
    accept: ".html,.md,.docx,.pdf,.txt,.rtf",
    fileHint: "DOCX, PDF, HTML, MD, TXT",
  },
]

interface ImportedItem {
  id: string
  source: string
  title: string
  status: "pending" | "importing" | "done" | "error"
  type: "link" | "file"
  url?: string
  fileName?: string
}

function ImportPanel({ onImportDone }: { onImportDone: (lessons: Lesson[]) => void }) {
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState("")
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const source = IMPORT_SOURCES.find((s) => s.id === activeSource)

  const handleImportLink = () => {
    if (!linkUrl.trim() || !activeSource) return
    const srcName = IMPORT_SOURCES.find((s) => s.id === activeSource)?.name ?? activeSource
    const item: ImportedItem = {
      id: `imp-${Date.now()}`,
      source: activeSource,
      title: `Импорт из ${srcName}`,
      status: "importing",
      type: "link",
      url: linkUrl.trim(),
    }
    setImportedItems((prev) => [...prev, item])
    setLinkUrl("")

    // Simulate import
    setTimeout(() => {
      setImportedItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: "done", title: extractTitleFromUrl(it.url!) }
            : it
        )
      )
      toast.success(`Контент из ${srcName} импортирован`)
    }, 1500 + Math.random() * 1000)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const srcId = activeSource || "file"
    const srcName = IMPORT_SOURCES.find((s) => s.id === srcId)?.name ?? "Файл"

    Array.from(files).forEach((file, idx) => {
      const item: ImportedItem = {
        id: `imp-${Date.now()}-${idx}`,
        source: srcId,
        title: file.name,
        status: "importing",
        type: "file",
        fileName: file.name,
      }
      setImportedItems((prev) => [...prev, item])

      setTimeout(() => {
        setImportedItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "done" } : it
          )
        )
        toast.success(`Файл «${file.name}» обработан`)
      }, 1200 + Math.random() * 800)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const removeItem = (id: string) => {
    setImportedItems((prev) => prev.filter((it) => it.id !== id))
  }

  const doneItems = importedItems.filter((it) => it.status === "done")

  const handleApplyImport = () => {
    if (doneItems.length === 0) return
    // Convert imported items to lessons
    const lessons: Lesson[] = doneItems.map((item, i) => ({
      id: `lesson-imp-${Date.now()}-${i}`,
      emoji: item.source === "notion" ? "📝" : item.source === "ispring" ? "🎓" : item.source === "platrum" ? "📚" : "📄",
      title: cleanTitle(item.title),
      blocks: [
        {
          ...createBlock("text"),
          content: generateMockContent(item),
        },
      ],
    }))
    onImportDone(lessons)
    toast.success(`${lessons.length} ${lessons.length === 1 ? "раздел импортирован" : "разделов импортировано"} в редактор`)
  }

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Source selector */}
      <div className="p-4 border-b bg-muted/20">
        <p className="text-sm font-medium mb-3">Откуда импортировать?</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {IMPORT_SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSource(activeSource === s.id ? null : s.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center",
                activeSource === s.id
                  ? `${s.bg} ${s.border} border-2 shadow-sm`
                  : "bg-background border-border hover:border-foreground/20 hover:shadow-sm",
              )}
            >
              <span className="text-2xl">{s.icon}</span>
              <span className="text-xs font-medium leading-tight">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active source — link input + file upload */}
      {activeSource && source && (
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{source.icon}</span>
            <span className="font-medium">{source.name}</span>
            <span className="text-muted-foreground">— {source.desc}</span>
          </div>

          {/* URL input (hide for plain file) */}
          {source.placeholder && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ссылка на материал</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder={source.placeholder}
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleImportLink()}
                    className="h-10 pl-10"
                  />
                </div>
                <Button onClick={handleImportLink} disabled={!linkUrl.trim()} className="gap-1.5 shrink-0">
                  <ArrowRight className="size-4" />
                  Импортировать
                </Button>
              </div>
            </div>
          )}

          {/* File drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-foreground/30 hover:bg-muted/30",
            )}
          >
            <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">
              Перетащите файлы сюда или <span className="text-primary">выберите</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {source.fileHint} • Макс. 50 МБ
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={source.accept}
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Imported items list */}
      {importedItems.length > 0 && (
        <div className="p-4 space-y-3">
          <p className="text-sm font-medium">Импортированные материалы</p>
          <div className="space-y-2">
            {importedItems.map((item) => {
              const srcMeta = IMPORT_SOURCES.find((s) => s.id === item.source)
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                    item.status === "done" ? "bg-emerald-50/50 border-emerald-200" : "bg-muted/30 border-border",
                    item.status === "error" && "bg-red-50/50 border-red-200",
                  )}
                >
                  <span className="text-base shrink-0">{srcMeta?.icon ?? "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.url && (
                      <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "importing" && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <Loader2 className="size-3.5 animate-spin" />
                        Импорт...
                      </span>
                    )}
                    {item.status === "done" && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="size-3.5" />
                        Готово
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Apply button */}
          {doneItems.length > 0 && (
            <Button onClick={handleApplyImport} className="gap-1.5 w-full">
              <ArrowRight className="size-4" />
              Перенести {doneItems.length} {doneItems.length === 1 ? "материал" : doneItems.length < 5 ? "материала" : "материалов"} в редактор
            </Button>
          )}
        </div>
      )}

      {/* Empty state */}
      {importedItems.length === 0 && !activeSource && (
        <div className="p-8 text-center">
          <FileText className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Выберите источник, вставьте ссылку или загрузите файл
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Контент будет автоматически преобразован в разделы статьи
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractTitleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.split("/").filter(Boolean).pop() ?? ""
    return decodeURIComponent(path)
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 60) || "Импортированная страница"
  } catch {
    return "Импортированная страница"
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\.(html|md|docx|pdf|txt|rtf|zip|pptx)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 60) || "Импортированный раздел"
}

function generateMockContent(item: ImportedItem): string {
  if (item.source === "notion") {
    return `<p>Контент импортирован из Notion.</p><p>Здесь будет содержимое страницы <b>${item.title}</b>, преобразованное из формата Notion в блоки редактора.</p><p>Все заголовки, списки, изображения и вложения сохранены.</p>`
  }
  if (item.source === "ispring") {
    return `<p>Курс импортирован из iSpring Learn.</p><p>Слайды и тестовые вопросы из <b>${item.title}</b> преобразованы в разделы и блоки заданий.</p>`
  }
  if (item.source === "platrum") {
    return `<p>Статья импортирована из Platrum.</p><p>Содержимое <b>${item.title}</b> перенесено с сохранением структуры и форматирования.</p>`
  }
  return `<p>Содержимое файла <b>${item.title}</b> успешно импортировано и преобразовано в формат редактора.</p>`
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewArticlePage() {
  const router = useRouter()
  const editorRef = useRef<NotionEditorHandle>(null)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [demo, setDemo] = useState<Demo>(createInitialDemo)
  const [status, setStatus] = useState("draft")
  const [isPinned, setIsPinned] = useState(false)
  const [reviewerId, setReviewerId] = useState("")
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [authorId, setAuthorId] = useState("e1")
  const [coAuthorIds, setCoAuthorIds] = useState<string[]>([])
  const [showCoAuthorSelect, setShowCoAuthorSelect] = useState(false)
  const [contentTab, setContentTab] = useState<"editor" | "import">("editor")

  const handleDemoUpdate = useCallback((updated: Demo) => {
    setDemo(updated)
  }, [])

  const handleImportDone = useCallback((lessons: Lesson[]) => {
    setDemo((prev) => ({
      ...prev,
      lessons: [...prev.lessons, ...lessons],
      updatedAt: new Date(),
    }))
    setContentTab("editor")
  }, [])

  // Category management
  const [categories, setCategories] = useState(INITIAL_CATEGORIES)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState("")

  const handleAddCategory = () => {
    if (!newCatName.trim()) return
    const slug = newCatName.trim().toLowerCase().replace(/\s+/g, "-")
    setCategories((prev) => [...prev, { value: slug, label: newCatName.trim() }])
    setCategory(slug)
    setNewCatName("")
    setShowNewCategory(false)
    toast.success(`Категория «${newCatName.trim()}» создана`)
  }

  // Tags
  const handleAddTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t])
    }
    setTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      handleAddTag()
    }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  // Save
  const handleSave = () => {
    // TODO: POST to /api/modules/knowledge/articles
    toast.success("Статья сохранена")
    router.push("/knowledge")
  }

  const handleSendToReview = () => {
    if (!reviewerId) {
      toast.error("Выберите проверяющего")
      return
    }
    // TODO: POST with status: "review"
    const reviewer = MOCK_REVIEWERS.find((r) => r.id === reviewerId)
    toast.success(`Статья отправлена на проверку → ${reviewer?.name}`)
    router.push("/knowledge")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/knowledge" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Новая статья</span>
            </div>

            <h1 className="text-xl font-semibold text-foreground mb-6">Новая статья</h1>

            <div className="max-w-5xl space-y-5">

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="title">Заголовок</Label>
                <Input
                  id="title"
                  placeholder="Введите заголовок статьи"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10"
                />
              </div>

              {/* Category with add-new */}
              <div className="space-y-1.5">
                <Label>Категория</Label>
                <div className="flex items-center gap-2">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-10 flex-1">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => setShowNewCategory(true)}
                  >
                    <Plus className="size-3.5" />
                    Новая
                  </Button>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label htmlFor="tags">Теги</Label>
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  id="tags"
                  placeholder="Введите тег и нажмите Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleAddTag}
                  className="h-10"
                />
              </div>

              {/* Author & co-authors */}
              <div className="flex items-start gap-6 flex-wrap">
                <div className="space-y-1.5">
                  <Label>Автор</Label>
                  <Select value={authorId} onValueChange={setAuthorId}>
                    <SelectTrigger className="h-10 w-64">
                      <SelectValue placeholder="Выберите автора" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOCK_EMPLOYEES.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          <span className="flex items-center gap-2">
                            <span className="size-5 rounded-full text-white text-[10px] font-medium flex items-center justify-center shrink-0" style={{ backgroundColor: e.color }}>{e.initials}</span>
                            {e.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Соавторы</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {coAuthorIds.map((id) => {
                      const emp = MOCK_EMPLOYEES.find((e) => e.id === id)
                      if (!emp) return null
                      return (
                        <Badge key={id} variant="secondary" className="gap-1.5 pr-1 font-normal h-8">
                          <Avatar className="size-5">
                            <AvatarFallback style={{ backgroundColor: emp.color }} className="text-white text-[9px] font-medium">{emp.initials}</AvatarFallback>
                          </Avatar>
                          {emp.name}
                          <button type="button" onClick={() => setCoAuthorIds((p) => p.filter((x) => x !== id))} className="hover:text-destructive ml-0.5">
                            <X className="size-3" />
                          </button>
                        </Badge>
                      )
                    })}
                    <Select value="" onValueChange={(v) => { if (v && !coAuthorIds.includes(v) && v !== authorId) setCoAuthorIds((p) => [...p, v]) }}>
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground"><UserPlus className="size-3.5" />Добавить</span>
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_EMPLOYEES.filter((e) => e.id !== authorId && !coAuthorIds.includes(e.id)).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            <span className="flex items-center gap-2">
                              <span className="size-5 rounded-full text-white text-[10px] font-medium flex items-center justify-center shrink-0" style={{ backgroundColor: e.color }}>{e.initials}</span>
                              {e.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Content — tabs: Editor / Import */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Контент</Label>
                  <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg">
                    <button
                      type="button"
                      onClick={() => setContentTab("editor")}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5",
                        contentTab === "editor"
                          ? "bg-background shadow-sm font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Редактор
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTab("import")}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5",
                        contentTab === "import"
                          ? "bg-background shadow-sm font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Upload className="size-3.5" />
                      Импорт
                    </button>
                  </div>
                </div>

                {contentTab === "editor" ? (
                  <div className="border rounded-xl overflow-hidden bg-card">
                    <NotionEditor
                      ref={editorRef}
                      demo={demo}
                      onBack={() => router.push("/knowledge")}
                      onUpdate={handleDemoUpdate}
                      hideToolbar
                    />
                  </div>
                ) : (
                  <ImportPanel onImportDone={handleImportDone} />
                )}
              </div>

              {/* Quiz / control questions */}
              <div className="border-t pt-5">
                <QuizEditor questions={questions} onChange={setQuestions} />
              </div>

              {/* Status, reviewer, pinned */}
              <div className="flex items-start gap-6 flex-wrap">
                <div className="space-y-1.5">
                  <Label>Статус</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Черновик</SelectItem>
                      <SelectItem value="review">На проверку</SelectItem>
                      <SelectItem value="published">Опубликовать</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reviewer — shown when status is "review" */}
                {status === "review" && (
                  <div className="space-y-1.5">
                    <Label>Проверяющий</Label>
                    <Select value={reviewerId} onValueChange={setReviewerId}>
                      <SelectTrigger className="h-10 w-64">
                        <SelectValue placeholder="Выберите проверяющего" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_REVIEWERS.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name} — {r.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-7">
                  <Checkbox
                    id="pinned"
                    checked={isPinned}
                    onCheckedChange={(v) => setIsPinned(v === true)}
                  />
                  <Label htmlFor="pinned" className="font-normal cursor-pointer">Закреплённая</Label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {status === "review" ? (
                  <Button onClick={handleSendToReview} className="gap-1.5" disabled={!title.trim()}>
                    <Send className="size-4" />
                    Отправить на проверку
                  </Button>
                ) : (
                  <Button onClick={handleSave} className="gap-1.5" disabled={!title.trim()}>
                    <Save className="size-4" />
                    Сохранить
                  </Button>
                )}
                <Link href="/knowledge">
                  <Button variant="outline">Отмена</Button>
                </Link>
              </div>
            </div>

          </div>
        </div>
      </SidebarInset>

      {/* New category dialog */}
      <Dialog open={showNewCategory} onOpenChange={setShowNewCategory}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая категория</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Название</Label>
              <Input
                id="cat-name"
                placeholder="Например: Финансы"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                className="h-10"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewCategory(false)}>Отмена</Button>
              <Button onClick={handleAddCategory} disabled={!newCatName.trim()}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
