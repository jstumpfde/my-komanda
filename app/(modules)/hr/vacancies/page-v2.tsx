"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebarV2 } from "@/components/dashboard/sidebar-v2"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Plus, Briefcase, MapPin, Search, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface Vacancy {
  id: string
  title: string
  city: string | null
  format: string | null
  employment: string | null
  salaryMin: number | null
  salaryMax: number | null
  status: string
  slug: string
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  published: "Опубликована",
  draft:     "Черновик",
  paused:    "Приостановлена",
  closed:    "Закрыта",
}

const STATUS_COLORS: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  draft:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  paused:    "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  closed:    "bg-muted text-muted-foreground",
}

const FORMAT_LABELS: Record<string, string> = {
  office: "Офис", hybrid: "Гибрид", remote: "Удалённо",
}

export default function VacanciesPageV2() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/modules/hr/vacancies-v2")
      .then((r) => r.json())
      .then((data) => { setVacancies(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = vacancies.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase()) ||
    (v.city ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebarV2 />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6">
          {/* Шапка */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Вакансии</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? "Загрузка..." : `${vacancies.length} вакансий`}
              </p>
            </div>
            <Button asChild>
              <Link href="/hr/vacancies/create">
                <Plus className="w-4 h-4 mr-2" />
                Создать вакансию
              </Link>
            </Button>
          </div>

          {/* Поиск */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию или городу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Список */}
          {loading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Briefcase className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                {search ? "Ничего не найдено" : "Вакансий пока нет"}
              </p>
              {!search && (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/hr/vacancies/create">Создать первую вакансию</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((v) => (
                <Link
                  key={v.id}
                  href={`/hr/vacancies/${v.id}`}
                  className="group rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium group-hover:text-primary transition-colors truncate">
                          {v.title}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn("shrink-0", STATUS_COLORS[v.status] ?? "")}
                        >
                          {STATUS_LABELS[v.status] ?? v.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                        {v.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {v.city}
                          </span>
                        )}
                        {v.format && (
                          <span>{FORMAT_LABELS[v.format] ?? v.format}</span>
                        )}
                        {(v.salaryMin || v.salaryMax) && (
                          <span>
                            {v.salaryMin ? `от ${v.salaryMin.toLocaleString("ru")} ₽` : ""}
                            {v.salaryMax ? ` до ${v.salaryMax.toLocaleString("ru")} ₽` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {v.status === "published" && (
                        <a
                          href={`/vacancy/${v.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleDateString("ru")}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
