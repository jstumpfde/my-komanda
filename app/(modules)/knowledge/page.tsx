"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Search, Plus, Eye, Pin, ClipboardList, BookOpen, Monitor,
  Users, Phone, GraduationCap,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Mock data ──────────────────────────────────────────────────────────────

interface Category {
  id: string
  slug: string
  name: string
  icon: string
  articleCount: number
  description: string
}

interface Article {
  id: string
  slug: string
  title: string
  category: string
  categorySlug: string
  views: number
  isPinned: boolean
  date: string
}

const CATEGORIES: Category[] = [
  { id: "1", slug: "onboarding",     name: "Онбординг",        icon: "clipboard",   articleCount: 12, description: "Всё для новых сотрудников" },
  { id: "2", slug: "regulations",    name: "Регламенты",       icon: "book",        articleCount: 8,  description: "Внутренние правила и процедуры" },
  { id: "3", slug: "it-security",    name: "IT и безопасность", icon: "monitor",    articleCount: 15, description: "Доступы, VPN, пароли" },
  { id: "4", slug: "hr-policies",    name: "HR-политики",      icon: "users",       articleCount: 6,  description: "Отпуска, больничные, KPI" },
  { id: "5", slug: "sales",          name: "Продажи",          icon: "phone",       articleCount: 10, description: "Скрипты, CRM, воронка" },
  { id: "6", slug: "learning",       name: "Обучение",         icon: "graduation",  articleCount: 4,  description: "Курсы, сертификаты, развитие" },
]

const POPULAR_ARTICLES: Article[] = [
  { id: "1", slug: "kak-oformit-otpusk",         title: "Как оформить отпуск",           category: "HR-политики",      categorySlug: "hr-policies",  views: 234, isPinned: true,  date: "2026-03-15" },
  { id: "2", slug: "nastroyka-vpn",               title: "Настройка VPN",                 category: "IT и безопасность", categorySlug: "it-security",  views: 189, isPinned: true,  date: "2026-03-10" },
  { id: "3", slug: "skript-kholodnogo-zvonka-v2", title: "Скрипт холодного звонка v2",    category: "Продажи",          categorySlug: "sales",        views: 156, isPinned: false, date: "2026-03-20" },
  { id: "4", slug: "chek-list-pervogo-dnya",       title: "Чек-лист первого дня",         category: "Онбординг",        categorySlug: "onboarding",   views: 142, isPinned: true,  date: "2026-02-28" },
  { id: "5", slug: "kak-zakazat-kantstovary",     title: "Как заказать канцтовары",       category: "Регламенты",       categorySlug: "regulations",  views: 98,  isPinned: false, date: "2026-03-05" },
]

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  clipboard:  <ClipboardList className="size-9 text-amber-500" />,
  book:       <BookOpen className="size-9 text-blue-500" />,
  monitor:    <Monitor className="size-9 text-emerald-500" />,
  users:      <Users className="size-9 text-violet-500" />,
  phone:      <Phone className="size-9 text-rose-500" />,
  graduation: <GraduationCap className="size-9 text-cyan-500" />,
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [search, setSearch] = useState("")

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return CATEGORIES
    const q = search.trim().toLowerCase()
    return CATEGORIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    )
  }, [search])

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return POPULAR_ARTICLES
    const q = search.trim().toLowerCase()
    return POPULAR_ARTICLES.filter(
      (a) => a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
    )
  }, [search])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-foreground">База знаний</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Внутренний портал знаний компании</p>
              </div>
              <Link href="/knowledge/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" />
                  Новая статья
                </Button>
              </Link>
            </div>

            {/* Search */}
            <div className="relative max-w-2xl mx-auto mb-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Поиск по базе знаний..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-12 text-base rounded-xl border-gray-300"
              />
            </div>

            {/* Categories grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {filteredCategories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/knowledge/category/${cat.slug}`}
                  className="group border rounded-xl p-6 transition-all bg-card"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">{CATEGORY_ICONS[cat.icon]}</div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {cat.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cat.articleCount} {cat.articleCount === 1 ? "статья" : cat.articleCount < 5 ? "статьи" : "статей"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{cat.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Popular articles */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Популярные статьи</h2>
              <div className="border rounded-xl overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Название</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Категория</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Просмотров</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArticles.map((article) => (
                      <tr key={article.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/knowledge/article/${article.slug}`}
                            className="font-medium text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5"
                          >
                            {article.isPinned && <Pin className="size-3.5 text-amber-500 shrink-0" />}
                            {article.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="font-normal">{article.category}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="size-3.5" />
                            {article.views}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(article.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
