"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, Eye, Pin } from "lucide-react"

// ─── Mock data ──────────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { name: string; description: string }> = {
  onboarding:    { name: "Онбординг",         description: "Всё для новых сотрудников: чек-листы, инструкции, контакты" },
  regulations:   { name: "Регламенты",        description: "Внутренние правила и процедуры компании" },
  "it-security": { name: "IT и безопасность",  description: "Доступы, VPN, пароли, информационная безопасность" },
  "hr-policies": { name: "HR-политики",       description: "Отпуска, больничные, KPI, компенсации" },
  sales:         { name: "Продажи",           description: "Скрипты, CRM, воронка продаж, работа с клиентами" },
  learning:      { name: "Обучение",          description: "Курсы, сертификаты, развитие сотрудников" },
}

interface Article {
  id: string
  slug: string
  title: string
  author: string
  date: string
  views: number
  status: string
  isPinned: boolean
  tags: string[]
}

const ALL_ARTICLES: Record<string, Article[]> = {
  onboarding: [
    { id: "4", slug: "chek-list-pervogo-dnya",   title: "Чек-лист первого дня",           author: "Анна Иванова",    date: "2026-02-28", views: 142, status: "published", isPinned: true,  tags: ["новичок", "чек-лист"] },
    { id: "10", slug: "kak-poluchit-dostupy",     title: "Как получить доступы",            author: "Дмитрий Козлов",  date: "2026-03-02", views: 88,  status: "published", isPinned: false, tags: ["доступы"] },
    { id: "11", slug: "znakomstvo-s-komandoy",    title: "Знакомство с командой",           author: "Мария Петрова",   date: "2026-01-15", views: 76,  status: "published", isPinned: false, tags: ["команда"] },
  ],
  regulations: [
    { id: "5", slug: "kak-zakazat-kantstovary",   title: "Как заказать канцтовары",         author: "Елена Сидорова",  date: "2026-03-05", views: 98,  status: "published", isPinned: false, tags: ["канцтовары", "заказ"] },
    { id: "12", slug: "pravila-raboty-v-ofise",   title: "Правила работы в офисе",          author: "Анна Иванова",    date: "2026-02-10", views: 65,  status: "published", isPinned: false, tags: ["офис"] },
  ],
  "it-security": [
    { id: "2", slug: "nastroyka-vpn",              title: "Настройка VPN",                  author: "Алексей Морозов", date: "2026-03-10", views: 189, status: "published", isPinned: true,  tags: ["VPN", "безопасность"] },
    { id: "13", slug: "paroli-i-2fa",              title: "Пароли и двухфакторная аутентификация", author: "Алексей Морозов", date: "2026-03-12", views: 134, status: "published", isPinned: false, tags: ["пароли", "2FA"] },
    { id: "14", slug: "bezopasnost-rabochego-mesta",title: "Безопасность рабочего места",   author: "Дмитрий Козлов",  date: "2026-02-20", views: 56,  status: "draft",     isPinned: false, tags: ["безопасность"] },
  ],
  "hr-policies": [
    { id: "1", slug: "kak-oformit-otpusk",         title: "Как оформить отпуск",            author: "Мария Петрова",   date: "2026-03-15", views: 234, status: "published", isPinned: true,  tags: ["отпуск", "HR"] },
    { id: "15", slug: "bolnichnye-i-kompensatsii", title: "Больничные и компенсации",       author: "Мария Петрова",   date: "2026-03-01", views: 112, status: "published", isPinned: false, tags: ["больничный"] },
  ],
  sales: [
    { id: "3", slug: "skript-kholodnogo-zvonka-v2",title: "Скрипт холодного звонка v2",    author: "Сергей Волков",   date: "2026-03-20", views: 156, status: "published", isPinned: false, tags: ["скрипт", "звонки"] },
    { id: "16", slug: "rabota-s-crm",              title: "Работа с CRM",                   author: "Сергей Волков",   date: "2026-03-18", views: 104, status: "published", isPinned: false, tags: ["CRM"] },
  ],
  learning: [
    { id: "17", slug: "spisok-kursov",              title: "Список доступных курсов",       author: "Анна Иванова",    date: "2026-03-08", views: 67,  status: "published", isPinned: false, tags: ["курсы", "обучение"] },
    { id: "18", slug: "sertifikatsiya-sotrudnikov", title: "Сертификация сотрудников",      author: "Елена Сидорова",  date: "2026-02-25", views: 45,  status: "draft",     isPinned: false, tags: ["сертификаты"] },
  ],
}

const STATUS_COLORS: Record<string, string> = {
  published:      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  draft:          "bg-gray-500/15 text-gray-700 dark:text-gray-400",
  review:         "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  review_changes: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  archived:       "bg-muted text-muted-foreground",
}

const STATUS_LABELS: Record<string, string> = {
  published:      "Опубликована",
  draft:          "Черновик",
  review:         "На проверке",
  review_changes: "Требуются правки",
  archived:       "В архиве",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const category = CATEGORIES[slug]
  const articles = ALL_ARTICLES[slug] ?? []

  if (!category) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 overflow-auto bg-background min-w-0">
            <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <p className="text-muted-foreground">Категория не найдена</p>
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
              <span className="text-foreground font-medium">{category.name}</span>
            </div>

            {/* Header */}
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-foreground">{category.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
            </div>

            {/* Articles table */}
            {articles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>В этой категории пока нет статей</p>
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Автор</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Просмотров</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Теги</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((article) => (
                      <tr key={article.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/knowledge/article/${article.slug}`}
                            className="font-medium text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5"
                          >
                            {article.isPinned && <Pin className="size-3.5 text-amber-500 shrink-0" />}
                            {article.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{article.author}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(article.date)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="size-3.5" />
                            {article.views}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={STATUS_COLORS[article.status]}>
                            {STATUS_LABELS[article.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {article.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="font-normal text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
