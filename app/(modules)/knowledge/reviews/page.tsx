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
  FileText, MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Mock data ──────────────────────────────────────────────────────────────

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
}

const REVIEW_ITEMS: ReviewItem[] = [
  {
    id: "1", articleSlug: "kak-oformit-otpusk", title: "Как оформить отпуск",
    author: "Мария Петрова", authorInitials: "МП", avatarColor: "#8b5cf6",
    category: "HR-политики", status: "review_changes", sentAt: "2026-04-04T10:00:00Z",
    commentsCount: 2, excerpt: "Порядок оформления отпуска, подача заявления, согласование, выплата отпускных...",
  },
  {
    id: "2", articleSlug: "pravila-raboty-v-ofise", title: "Правила работы в офисе",
    author: "Елена Сидорова", authorInitials: "ЕС", avatarColor: "#f59e0b",
    category: "Регламенты", status: "review", sentAt: "2026-04-05T09:15:00Z",
    commentsCount: 0, excerpt: "Рабочий график, пропускная система, правила чистого стола...",
  },
  {
    id: "3", articleSlug: "skript-kholodnogo-zvonka-v3", title: "Скрипт холодного звонка v3",
    author: "Сергей Волков", authorInitials: "СВ", avatarColor: "#3b82f6",
    category: "Продажи", status: "review", sentAt: "2026-04-05T14:30:00Z",
    commentsCount: 0, excerpt: "Обновлённый скрипт с новыми возражениями, кейсами из Q1 2026...",
  },
  {
    id: "4", articleSlug: "bezopasnost-rabochego-mesta", title: "Безопасность рабочего места",
    author: "Алексей Морозов", authorInitials: "АМ", avatarColor: "#22c55e",
    category: "IT и безопасность", status: "review", sentAt: "2026-04-06T08:00:00Z",
    commentsCount: 0, excerpt: "Блокировка экрана, VPN для удалёнщиков, 2FA обязательно для всех...",
  },
  {
    id: "5", articleSlug: "onboarding-buddies", title: "Гайд для наставников (Buddy)",
    author: "Анна Иванова", authorInitials: "АИ", avatarColor: "#ec4899",
    category: "Онбординг", status: "review_changes", sentAt: "2026-04-03T16:00:00Z",
    commentsCount: 3, excerpt: "Роль наставника, расписание встреч, чек-лист адаптации нового сотрудника...",
  },
]

const STATUS_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  review:         { label: "Ожидает проверки",  className: "bg-blue-500/15 text-blue-700", icon: <Clock className="size-3.5" /> },
  review_changes: { label: "Ждёт исправлений", className: "bg-amber-500/15 text-amber-700", icon: <AlertCircle className="size-3.5" /> },
}

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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = useMemo(() => {
    let items = REVIEW_ITEMS
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(
        (r) => r.title.toLowerCase().includes(q) || r.author.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== "all") {
      items = items.filter((r) => r.status === statusFilter)
    }
    return items
  }, [search, statusFilter])

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

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Статьи на проверке</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {pendingCount} ожидают проверки · {changesCount} ждут исправлений
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-5">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию или автору..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-56">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="review">Ожидает проверки</SelectItem>
                  <SelectItem value="review_changes">Ждёт исправлений</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="size-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Нет статей для проверки</p>
                <p className="text-sm mt-1">Все статьи проверены</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((item) => (
                  <Link
                    key={item.id}
                    href={`/knowledge/article/${item.articleSlug}/edit`}
                    className="block border rounded-xl p-4 hover:border-foreground/20 hover:shadow-sm transition-all bg-card group"
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
                          <span>{item.author}</span>
                          <span>
                            <Badge variant="outline" className="font-normal text-xs">{item.category}</Badge>
                          </span>
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
            )}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
