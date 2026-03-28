"use client"

import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useVacancies, type ApiVacancy } from "@/hooks/use-vacancies"
import { Plus, Briefcase, MapPin, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  draft: "Черновик",
  archived: "Архив",
}

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  draft:    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  archived: "bg-muted text-muted-foreground",
}

export default function VacanciesPage() {
  const { vacancies, total, loading } = useVacancies(1, 50)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Вакансии</h1>
                {!loading && (
                  <p className="text-sm text-muted-foreground mt-0.5">{total} вакансий</p>
                )}
              </div>
              <Button asChild>
                <Link href="/hr/vacancies/create">
                  <Plus className="size-4 mr-1.5" />
                  Создать вакансию
                </Link>
              </Button>
            </div>

            {loading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            )}

            {!loading && vacancies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Briefcase className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Вакансий пока нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">
                  Создайте первую вакансию чтобы начать найм
                </p>
                <Button asChild>
                  <Link href="/hr/vacancies/create">
                    <Plus className="size-4 mr-1.5" />
                    Создать вакансию
                  </Link>
                </Button>
              </div>
            )}

            {!loading && vacancies.length > 0 && (
              <div className="space-y-2">
                {vacancies.map((v: ApiVacancy) => (
                  <Link
                    key={v.id}
                    href={`/hr/vacancies/${v.id}`}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Briefcase className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {v.title}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                        {v.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            {v.city}
                          </span>
                        )}
                        {v.category && (
                          <span className="flex items-center gap-1">
                            <Building2 className="size-3.5" />
                            {v.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("border-0 text-xs shrink-0", STATUS_COLORS[v.status ?? 'draft'])}
                    >
                      {STATUS_LABELS[v.status ?? 'draft'] ?? v.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
