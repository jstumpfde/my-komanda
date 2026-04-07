"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  ChevronRight, Search, Eye, Clock, CheckCircle2, AlertCircle,
  MessageSquare, List, LayoutGrid, Table2, ArrowRight, User,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "list" | "kanban" | "table"

interface ReviewItem {
  id: string
  articleSlug: string
  title: string
  author: string
  authorInitials: string
  avatarColor: string
  category: string
  status: "review" | "review_changes"
  sentAt: string
  commentsCount: number
  excerpt: string
  questionsCount: number
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const REVIEW_ITEMS: ReviewItem[] = [
  {
    id: "1", articleSlug: "kak-oformit-otpusk", title: "Как оформить отпуск",
    author: "Мария Петрова", authorInitials: "МП", avatarColor: "#8b5cf6",
    category: "HR-политики", status: "review_changes", sentAt: "2026-04-04T10:00:00Z",
    commentsCount: 2, excerpt: "Порядок оформления отпуска, подача заявления, согласование, выплата отпускных...",
    questionsCount: 3,
  },
  {
    id: "2", articleSlug: "pravila-raboty-v-ofise", title: "Правила работы в офисе",
    author: "Елена Сидорова", authorInitials: "ЕС", avatarColor: "#f59e0b",
    category: "Регламенты", status: "review", sentAt: "2026-04-05T09:15:00Z",
    commentsCount: 0, excerpt: "Рабочий график, пропускная система, правила чистого стола...",
    questionsCount: 2,
  },
  {
    id: "3", articleSlug: "skript-kholodnogo-zvonka-v3", title: "Скрипт холодного звонка v3",
    author: "Сергей Волков", authorInitials: "СВ", avatarColor: "#3b82f6",
    category: "Продажи", status: "review", sentAt: "2026-04-05T14:30:00Z",
    commentsCount: 0, excerpt: "Обновлённый скрипт с новыми возражениями, кейсами из Q1 2026...",
    questionsCount: 5,
  },
  {
    id: "4", articleSlug: "bezopasnost-rabochego-mesta", title: "Безопасность рабочего места",
    author: "Алексей Морозов", authorInitials: "АМ", avatarColor: "#22c55e",
    category: "IT и безопасность", status: "review", sentAt: "2026-04-06T08:00:00Z",
    commentsCount: 0, excerpt: "Блокировка экрана, VPN для удалёнщиков, 2FA обязательно для всех...",
    questionsCount: 4,
  },
  {
    id: "5", articleSlug: "onboarding-buddies", title: "Гайд для наставников (Buddy)",
    author: "Анна Иванова", authorInitials: "АИ", avatarColor: "#ec4899",
    category: "Онбординг", status: "review_changes", sentAt: "2026-04-03T16:00:00Z",
    commentsCount: 3, excerpt: "Роль наставника, расписание встреч, чек-лист адаптации нового сотрудника...",
    questionsCount: 6,
  },
]

const STATUS_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  review:         { label: "Ожидает проверки",  className: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: <Clock className="size-3.5" /> },
  review_changes: { label: "Ждёт исправлений", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: <AlertCircle className="size-3.5" /> },
}

const VIEW_MODES: { value: ViewMode; icon: typeof List; label: string }[] = [
  { value: "list",   icon: List,       label: "Список" },
  { value: "kanban", icon: LayoutGrid, label: "Канбан" },
  { value: "table",  icon: Table2,     label: "Таблица" },
]

const AUTHORS = [...new Set(REVIEW_ITEMS.map((r) => r.author))]
const CATEGORIES = [...new Set(REVIEW_ITEMS.map((r) => r.category))]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return "менее часа"
  if (hours < 24) return `${hours} ч.`
  const days = Math.floor(hours / 24)
  return `${days} дн.`
}

// ─── List View ──────────────────────────────────────────────────────────────

function ListView({ items }: { items: ReviewItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/knowledge/article/${item.articleSlug}/edit`}
          className="block border rounded-xl p-4 hover:border-foreground/20 transition-all bg-card group"
        >
          <div className="flex items-start gap-4">
            <Avatar className="size-10 shrink-0 mt-0.5">
              <AvatarFallback style={{ backgroundColor: item.avatarColor }} className="text-white text-sm font-medium">
                {item.authorInitials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {item.title}
                </h3>
                <Badge variant="secondary" className={cn("shrink-0", STATUS_META[item.status].className)}>
                  <span className="flex items-center gap-1">
                    {STATUS_META[item.status].icon}
                    {STATUS_META[item.status].label}
                  </span>
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{item.excerpt}</p>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {item.author}
                </span>
                <Badge variant="outline" className="font-normal text-xs">{item.category}</Badge>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {timeSince(item.sentAt)} назад
                </span>
                {item.commentsCount > 0 && (
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {item.commentsCount}
                  </span>
                )}
                {item.questionsCount > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    {item.questionsCount} вопр.
                  </span>
                )}
              </div>
            </div>

            <Button variant="outline" size="sm" className="shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Eye className="size-3.5" />
              Проверить
            </Button>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─── Kanban View ────────────────────────────────────────────────────────────

function KanbanView({ items }: { items: ReviewItem[] }) {
  const columns: { key: string; label: string; color: string; items: ReviewItem[] }[] = [
    {
      key: "review",
      label: "Ожидает проверки",
      color: "border-blue-500",
      items: items.filter((i) => i.status === "review"),
    },
    {
      key: "review_changes",
      label: "Ждёт исправлений",
      color: "border-amber-500",
      items: items.filter((i) => i.status === "review_changes"),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {columns.map((col) => (
        <div key={col.key} className="min-w-0">
          {/* Column header */}
          <div className={cn("flex items-center gap-2 mb-3 pb-2 border-b-2", col.color)}>
            <span className="text-sm font-semibold">{col.label}</span>
            <Badge variant="secondary" className="text-xs font-normal">{col.items.length}</Badge>
          </div>

          {/* Cards */}
          <div className="space-y-2.5">
            {col.items.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                Нет статей
              </div>
            ) : (
              col.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/knowledge/article/${item.articleSlug}/edit`}
                  className="block border rounded-lg p-3.5 hover:border-foreground/20 transition-all bg-card group"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback style={{ backgroundColor: item.avatarColor }} className="text-white text-[10px] font-medium">
                        {item.authorInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.author}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2.5">{item.excerpt}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">{item.category}</Badge>
                      <span className="flex items-center gap-0.5">
                        <Clock className="size-3" />
                        {timeSince(item.sentAt)}
                      </span>
                      {item.commentsCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="size-3" />
                          {item.commentsCount}
                        </span>
                      )}
                    </div>
                    {item.questionsCount > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-3" />
                        {item.questionsCount}
                      </span>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Table View ─────────────────────────────────────────────────────────────

function TableView({ items }: { items: ReviewItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Статья</th>
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Автор</th>
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Категория</th>
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Статус</th>
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Вопросов</th>
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ожидание</th>
            <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors group">
              <td className="px-4 py-3">
                <Link
                  href={`/knowledge/article/${item.articleSlug}/edit`}
                  className="font-medium text-foreground hover:text-primary transition-colors"
                >
                  {item.title}
                </Link>
                {item.commentsCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <MessageSquare className="size-3" />
                    {item.commentsCount}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    <AvatarFallback style={{ backgroundColor: item.avatarColor }} className="text-white text-[9px] font-medium">
                      {item.authorInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-muted-foreground text-sm">{item.author}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="font-normal text-xs">{item.category}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className={cn("text-xs", STATUS_META[item.status].className)}>
                  <span className="flex items-center gap-1">
                    {STATUS_META[item.status].icon}
                    {STATUS_META[item.status].label}
                  </span>
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {item.questionsCount > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" />
                    {item.questionsCount}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {timeSince(item.sentAt)}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/knowledge/article/${item.articleSlug}/edit`}>
                  <Button variant="ghost" size="sm" className="size-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [authorFilter, setAuthorFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [view, setView] = useState<ViewMode>("list")

  const filtered = useMemo(() => {
    let items = REVIEW_ITEMS
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(
        (r) => r.title.toLowerCase().includes(q) || r.author.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== "all") items = items.filter((r) => r.status === statusFilter)
    if (authorFilter !== "all") items = items.filter((r) => r.author === authorFilter)
    if (categoryFilter !== "all") items = items.filter((r) => r.category === categoryFilter)
    return items
  }, [search, statusFilter, authorFilter, categoryFilter])

  const pendingCount = REVIEW_ITEMS.filter((r) => r.status === "review").length
  const changesCount = REVIEW_ITEMS.filter((r) => r.status === "review_changes").length

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
              <span className="text-foreground font-medium">На проверке</span>
            </div>

            {/* Header + view switcher */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Статьи на проверке</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {pendingCount} ожидают проверки · {changesCount} ждут исправлений
                </p>
              </div>

              {/* View switcher */}
              <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                {VIEW_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setView(m.value)}
                    title={m.label}
                    className={cn(
                      "flex items-center justify-center size-8 rounded-md transition-colors",
                      view === m.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <m.icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию или автору..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-52 border border-input rounded-md">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="review">Ожидает проверки</SelectItem>
                  <SelectItem value="review_changes">Ждёт исправлений</SelectItem>
                </SelectContent>
              </Select>
              <Select value={authorFilter} onValueChange={setAuthorFilter}>
                <SelectTrigger className="h-10 w-52 border border-input rounded-md">
                  <SelectValue placeholder="Все авторы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все авторы</SelectItem>
                  {AUTHORS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10 w-52 border border-input rounded-md">
                  <SelectValue placeholder="Все категории" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="size-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Нет статей для проверки</p>
                <p className="text-sm mt-1">Все статьи проверены</p>
              </div>
            ) : (
              <>
                {view === "list" && <ListView items={filtered} />}
                {view === "kanban" && <KanbanView items={filtered} />}
                {view === "table" && <TableView items={filtered} />}
              </>
            )}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
