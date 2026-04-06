"use client"

import { useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { NotionEditor, type NotionEditorHandle } from "@/components/vacancies/notion-editor"
import {
  ChevronRight, ChevronDown, Save, Send, Plus, X, CheckCircle2, AlertCircle,
  MessageSquare, Mic, Video, Paperclip, Play, FileText, UserPlus, Calendar,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Demo } from "@/lib/course-types"
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

const ARTICLES_DATA: Record<string, {
  title: string; category: string; categorySlug: string; tags: string[];
  content: string; status: string; isPinned: boolean; reviewerId?: string;
  authorId: string; coAuthorIds: string[];
  createdAt: string; updatedAt: string;
  lessons: { id: string; emoji: string; title: string; content: string }[];
}> = {
  "kak-oformit-otpusk": {
    title: "Как оформить отпуск", category: "HR-политики", categorySlug: "hr-policies",
    tags: ["отпуск", "HR"], status: "review_changes", isPinned: true, reviewerId: "r1",
    authorId: "e1", coAuthorIds: ["e5"],
    createdAt: "2026-03-15T10:00:00Z", updatedAt: "2026-04-04T16:20:00Z",
    content: `## Порядок оформления отпуска\n\n### 1. Подача заявления\nЗаявление на отпуск подаётся **не позднее чем за 14 дней** до начала отпуска.\n\nДля подачи заявления:\n- Откройте раздел «Заявления» в личном кабинете\n- Выберите тип отпуска: ежегодный, без сохранения ЗП, учебный\n- Укажите даты начала и окончания\n- Нажмите «Отправить на согласование»`,
    lessons: [
      { id: "l1", emoji: "📋", title: "Порядок оформления", content: "Заявление на отпуск подаётся <b>не позднее чем за 14 дней</b> до начала отпуска." },
      { id: "l2", emoji: "📅", title: "Виды отпуска", content: "Ежегодный оплачиваемый, без сохранения ЗП, учебный, декретный." },
    ],
  },
  "nastroyka-vpn": {
    title: "Настройка VPN", category: "IT и безопасность", categorySlug: "it-security",
    tags: ["VPN", "безопасность"], status: "published", isPinned: true,
    authorId: "e2", coAuthorIds: [],
    createdAt: "2026-02-20T09:00:00Z", updatedAt: "2026-03-28T11:45:00Z",
    content: `## Настройка корпоративного VPN\n\n### Шаг 1. Получите учётные данные\nОбратитесь в IT-отдел через тикет-систему.`,
    lessons: [
      { id: "l1", emoji: "🔐", title: "Получение доступа", content: "Обратитесь в IT-отдел через тикет-систему." },
    ],
  },
}

// Mock review history
interface ReviewComment {
  id: string
  author: string
  authorInitials: string
  avatarColor: string
  action: "comment" | "approve" | "request_changes"
  comment?: string
  voiceUrl?: string
  videoUrl?: string
  attachments?: string[]
  date: string
}

const MOCK_REVIEWS: Record<string, ReviewComment[]> = {
  "kak-oformit-otpusk": [
    {
      id: "rev1", author: "Анна Иванова", authorInitials: "АИ", avatarColor: "#8b5cf6",
      action: "request_changes",
      comment: "Нужно добавить информацию о сроках выплаты отпускных и уточнить процедуру переноса. Также не хватает раздела про отпуск без сохранения ЗП — сколько дней положено по закону.",
      videoUrl: "screen-recording-review-01.webm",
      date: "2026-04-04T14:30:00Z",
    },
    {
      id: "rev2", author: "Анна Иванова", authorInitials: "АИ", avatarColor: "#8b5cf6",
      action: "comment",
      comment: "В разделе «Согласование» нужно указать конкретные сроки — за сколько дней каждый этап должен быть завершён.",
      voiceUrl: "voice-note-review-02.ogg",
      date: "2026-04-04T14:35:00Z",
    },
  ],
}

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  approve:         { label: "Одобрено",          icon: <CheckCircle2 className="size-4" />, color: "text-emerald-600" },
  request_changes: { label: "Требуются правки",  icon: <AlertCircle className="size-4" />,  color: "text-amber-600" },
  comment:         { label: "Комментарий",       icon: <MessageSquare className="size-4" />, color: "text-blue-600" },
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

// ─── Review panel (for reviewer to leave feedback) ──────────────────────────

function ReviewPanel({ articleSlug, reviews }: { articleSlug: string; reviews: ReviewComment[] }) {
  const [commentText, setCommentText] = useState("")
  const [reviewAction, setReviewAction] = useState<"comment" | "approve" | "request_changes">("comment")
  const [localReviews, setLocalReviews] = useState(reviews)
  const [isRecording, setIsRecording] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(reviews.length > 0)

  const handleSubmitReview = () => {
    if (!commentText.trim() && reviewAction === "comment") {
      toast.error("Напишите комментарий")
      return
    }

    const newReview: ReviewComment = {
      id: `rev-new-${Date.now()}`,
      author: "Вы",
      authorInitials: "ВЫ",
      avatarColor: "#3b82f6",
      action: reviewAction,
      comment: commentText.trim() || undefined,
      attachments: attachedFiles.length > 0 ? attachedFiles : undefined,
      date: new Date().toISOString(),
    }

    setLocalReviews((prev) => [newReview, ...prev])
    setCommentText("")
    setAttachedFiles([])
    setIsOpen(true)

    if (reviewAction === "approve") {
      toast.success("Статья одобрена и опубликована")
    } else if (reviewAction === "request_changes") {
      toast.success("Замечания отправлены автору")
    } else {
      toast.success("Комментарий добавлен")
    }
  }

  const handleVoiceRecord = () => {
    setIsRecording(!isRecording)
    if (isRecording) {
      toast.success("Голосовое сообщение записано")
    }
  }

  const handleVideoRecord = () => {
    toast("Запись экрана", { description: "Функция записи экрана будет доступна в ближайшем обновлении" })
  }

  const handleAttach = () => {
    setAttachedFiles((prev) => [...prev, `screenshot-${Date.now()}.png`])
    toast.success("Файл прикреплён")
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-xl bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full px-4 py-3 border-b bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Проверка и комментарии</h3>
              {localReviews.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{localReviews.length}</Badge>
              )}
            </div>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* New review form */}
          <div className="p-4 border-b space-y-3">
            {/* Action type */}
            <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg w-fit">
              {(["comment", "approve", "request_changes"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setReviewAction(a)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md transition-colors flex items-center gap-1",
                    reviewAction === a
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {ACTION_META[a].icon}
                  {ACTION_META[a].label}
                </button>
              ))}
            </div>

            {/* Comment input */}
            <Textarea
              placeholder={
                reviewAction === "approve"
                  ? "Комментарий (необязательно)..."
                  : "Напишите комментарий, замечание или объяснение..."
              }
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={3}
              className="text-sm"
            />

            {/* Attached files */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachedFiles.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1 font-normal text-xs">
                    <FileText className="size-3" />
                    {f}
                    <button type="button" onClick={() => setAttachedFiles((p) => p.filter((_, idx) => idx !== i))}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Media buttons + submit */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("gap-1 text-xs", isRecording && "text-red-500")}
                  onClick={handleVoiceRecord}
                >
                  <Mic className="size-3.5" />
                  {isRecording ? "Остановить" : "Голос"}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleVideoRecord}>
                  <Video className="size-3.5" />
                  Видео
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleAttach}>
                  <Paperclip className="size-3.5" />
                  Файл
                </Button>
              </div>

              <Button size="sm" onClick={handleSubmitReview} className="gap-1">
                <Send className="size-3.5" />
                Отправить
              </Button>
            </div>
          </div>

          {/* Review history */}
          <div className="divide-y max-h-[500px] overflow-auto">
            {localReviews.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Комментариев пока нет
              </div>
            ) : (
              localReviews.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback style={{ backgroundColor: r.avatarColor }} className="text-white text-xs font-medium">
                        {r.authorInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{r.author}</span>
                        <span className={cn("flex items-center gap-1 text-xs font-medium", ACTION_META[r.action].color)}>
                          {ACTION_META[r.action].icon}
                          {ACTION_META[r.action].label}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(r.date)}</span>
                      </div>
                      {r.comment && (
                        <p className="text-sm text-foreground/80 leading-relaxed">{r.comment}</p>
                      )}
                      {/* Media indicators */}
                      <div className="flex items-center gap-2 mt-2">
                        {r.voiceUrl && (
                          <button className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Play className="size-3" />
                            Голосовое сообщение
                          </button>
                        )}
                        {r.videoUrl && (
                          <button className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Video className="size-3" />
                            Видеозапись с экрана
                          </button>
                        )}
                        {r.attachments && r.attachments.map((a, i) => (
                          <button key={i} className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <FileText className="size-3" />
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>

        {/* Collapsed summary when no comments */}
        {!isOpen && localReviews.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            Комментариев пока нет
          </div>
        )}
      </div>
    </Collapsible>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft:          { label: "Черновик",         className: "bg-muted text-muted-foreground" },
  review:         { label: "На проверке",      className: "bg-blue-500/15 text-blue-700" },
  review_changes: { label: "Требуются правки", className: "bg-amber-500/15 text-amber-700" },
  published:      { label: "Опубликована",     className: "bg-emerald-500/15 text-emerald-700" },
  archived:       { label: "В архиве",         className: "bg-muted text-muted-foreground" },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  })
}

function buildDemoFromArticle(article: typeof ARTICLES_DATA[string]): Demo {
  return {
    id: `article-${Date.now()}`,
    title: article.title,
    companyName: "",
    description: "",
    status: "draft",
    createdAt: new Date(article.createdAt),
    updatedAt: new Date(article.updatedAt),
    coverGradientFrom: "#fef3c7",
    coverGradientTo: "#fde68a",
    lessons: article.lessons.map((l) => ({
      id: l.id,
      emoji: l.emoji,
      title: l.title,
      blocks: [{ ...createBlock("text"), content: l.content }],
    })),
  }
}

export default function EditArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const editorRef = useRef<NotionEditorHandle>(null)
  const existing = ARTICLES_DATA[slug]

  const [title, setTitle] = useState(existing?.title ?? "")
  const [category, setCategory] = useState(existing?.categorySlug ?? "")
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const [demo, setDemo] = useState<Demo>(() => existing ? buildDemoFromArticle(existing) : {
    id: `article-${Date.now()}`, title: "", companyName: "", description: "",
    status: "draft", createdAt: new Date(), updatedAt: new Date(),
    coverGradientFrom: "#fef3c7", coverGradientTo: "#fde68a",
    lessons: [{ id: `l-${Date.now()}`, emoji: "📄", title: "Основной раздел", blocks: [createBlock("text")] }],
  })
  const [status, setStatus] = useState(existing?.status ?? "draft")
  const [isPinned, setIsPinned] = useState(existing?.isPinned ?? false)
  const [reviewerId, setReviewerId] = useState(existing?.reviewerId ?? "")
  const [authorId, setAuthorId] = useState(existing?.authorId ?? "e1")
  const [coAuthorIds, setCoAuthorIds] = useState<string[]>(existing?.coAuthorIds ?? [])

  const handleDemoUpdate = useCallback((updated: Demo) => {
    setDemo(updated)
  }, [])

  // Category management
  const [categories, setCategories] = useState(INITIAL_CATEGORIES)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState("")

  const reviews = MOCK_REVIEWS[slug] ?? []
  const hasReviewFlow = status === "review" || status === "review_changes"

  const handleAddCategory = () => {
    if (!newCatName.trim()) return
    const catSlug = newCatName.trim().toLowerCase().replace(/\s+/g, "-")
    setCategories((prev) => [...prev, { value: catSlug, label: newCatName.trim() }])
    setCategory(catSlug)
    setNewCatName("")
    setShowNewCategory(false)
    toast.success(`Категория «${newCatName.trim()}» создана`)
  }

  const handleAddTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); handleAddTag() }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  const handleSave = () => {
    toast.success("Изменения сохранены")
    router.push(`/knowledge/article/${slug}`)
  }

  const handleSendToReview = () => {
    if (!reviewerId) { toast.error("Выберите проверяющего"); return }
    const reviewer = MOCK_REVIEWERS.find((r) => r.id === reviewerId)
    toast.success(`Статья отправлена на проверку → ${reviewer?.name}`)
    router.push("/knowledge")
  }

  if (!existing) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 overflow-auto bg-background min-w-0">
            <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <p className="text-muted-foreground">Статья не найдена</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
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
              <Link href={`/knowledge/article/${slug}`} className="hover:text-foreground transition-colors">
                {existing.title}
              </Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Редактирование</span>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <h1 className="text-xl font-semibold text-foreground">Редактирование статьи</h1>
              {STATUS_BADGE[status] && (
                <Badge variant="secondary" className={STATUS_BADGE[status].className}>
                  {STATUS_BADGE[status].label}
                </Badge>
              )}
            </div>

            {/* Two-column layout when review active */}
            <div className={cn("gap-6", hasReviewFlow ? "grid grid-cols-[1fr_380px]" : "max-w-5xl")}>

              {/* Left — editor form */}
              <div className="space-y-5 min-w-0">

                <div className="space-y-1.5">
                  <Label htmlFor="title">Заголовок</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
                </div>

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
                    <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => setShowNewCategory(true)}>
                      <Plus className="size-3.5" />
                      Новая
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tags">Теги</Label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="size-3" /></button>
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

                {/* Dates — created & updated */}
                {existing && (
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="size-3.5" />
                      <span>Создана: <span className="text-foreground font-medium">{formatDate(existing.createdAt)}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="size-3.5" />
                      <span>Актуализирована: <span className="text-foreground font-medium">{formatDate(existing.updatedAt)}</span></span>
                    </div>
                  </div>
                )}

                {/* Content — Notion-style editor */}
                <div className="space-y-1.5">
                  <Label>Контент</Label>
                  <div className="border rounded-xl overflow-hidden bg-card">
                    <NotionEditor
                      ref={editorRef}
                      demo={demo}
                      onBack={() => router.push("/knowledge")}
                      onUpdate={handleDemoUpdate}
                      hideToolbar
                    />
                  </div>
                </div>

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

                  {status === "review" && (
                    <div className="space-y-1.5">
                      <Label>Проверяющий</Label>
                      <Select value={reviewerId} onValueChange={setReviewerId}>
                        <SelectTrigger className="h-10 w-64">
                          <SelectValue placeholder="Выберите проверяющего" />
                        </SelectTrigger>
                        <SelectContent>
                          {MOCK_REVIEWERS.map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name} — {r.role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-7">
                    <Checkbox id="pinned" checked={isPinned} onCheckedChange={(v) => setIsPinned(v === true)} />
                    <Label htmlFor="pinned" className="font-normal cursor-pointer">Закреплённая</Label>
                  </div>
                </div>

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
                  <Link href={`/knowledge/article/${slug}`}>
                    <Button variant="outline">Отмена</Button>
                  </Link>
                </div>
              </div>

              {/* Right — review panel */}
              {hasReviewFlow && (
                <div className="sticky top-6">
                  <ReviewPanel articleSlug={slug} reviews={reviews} />
                </div>
              )}
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
