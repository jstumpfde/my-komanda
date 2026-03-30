"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import {
  ArrowLeft, ExternalLink, MapPin, Users, Trash2, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Vacancy {
  id: string
  title: string
  city: string | null
  format: string | null
  employment: string | null
  category: string | null
  salaryMin: number | null
  salaryMax: number | null
  status: string
  slug: string
  descriptionJson: { blocks?: Array<{ type: string; content: string }> } | null
  createdAt: string
  updatedAt: string
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

const EMPLOYMENT_LABELS: Record<string, string> = {
  full: "Полная", part: "Частичная", project: "Проектная", internship: "Стажировка",
}

export default function VacancyPageV2() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [vacancy, setVacancy] = useState<Vacancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [candidateCount, setCandidateCount] = useState(0)

  useEffect(() => {
    fetch(`/api/modules/hr/vacancies-v2/${id}`)
      .then((r) => r.json())
      .then((data) => { setVacancy(data); setLoading(false) })
      .catch(() => { setLoading(false) })

    fetch(`/api/modules/hr/candidates-v2?vacancyId=${id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCandidateCount(data.length) })
      .catch(() => {})
  }, [id])

  const updateStatus = async (status: string) => {
    if (!vacancy) return
    setStatusSaving(true)
    const res = await fetch(`/api/modules/hr/vacancies-v2/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const updated = await res.json()
      setVacancy(updated)
    }
    setStatusSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await fetch(`/api/modules/hr/vacancies-v2/${id}`, { method: "DELETE" })
    router.push("/hr/vacancies")
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!vacancy) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="p-6">
            <p className="text-muted-foreground">Вакансия не найдена</p>
            <Button asChild variant="link" className="p-0 mt-2">
              <Link href="/hr/vacancies">← Вернуться к списку</Link>
            </Button>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const description = vacancy.descriptionJson?.blocks
    ?.map((b) => b.content)
    .join("\n\n") ?? ""

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6 max-w-4xl">
          {/* Навигация */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/hr/vacancies">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Вакансии
              </Link>
            </Button>
          </div>

          {/* Шапка */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold">{vacancy.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                {vacancy.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {vacancy.city}
                  </span>
                )}
                {vacancy.format && <span>{FORMAT_LABELS[vacancy.format] ?? vacancy.format}</span>}
                {vacancy.employment && <span>{EMPLOYMENT_LABELS[vacancy.employment] ?? vacancy.employment}</span>}
                {(vacancy.salaryMin || vacancy.salaryMax) && (
                  <span>
                    {vacancy.salaryMin ? `от ${vacancy.salaryMin.toLocaleString("ru")} ₽` : ""}
                    {vacancy.salaryMax ? ` до ${vacancy.salaryMax.toLocaleString("ru")} ₽` : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Смена статуса */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(STATUS_COLORS[vacancy.status] ?? "")}
                >
                  {STATUS_LABELS[vacancy.status] ?? vacancy.status}
                </Badge>
                <Select value={vacancy.status} onValueChange={updateStatus} disabled={statusSaving}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    {statusSaving ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Сохраняем...
                      </span>
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="published">Опубликовать</SelectItem>
                    <SelectItem value="paused">Приостановить</SelectItem>
                    <SelectItem value="closed">Закрыть</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {vacancy.status === "published" && (
                <Button asChild variant="outline" size="sm">
                  <a href={`/vacancy/${vacancy.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Открыть
                  </a>
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить вакансию?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Вакансия «{vacancy.title}» будет удалена безвозвратно вместе со всеми кандидатами.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Табы */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Обзор</TabsTrigger>
              <TabsTrigger value="candidates">
                Кандидаты
                {candidateCount > 0 && (
                  <span className="ml-1.5 bg-primary/15 text-primary text-xs font-medium px-1.5 py-0.5 rounded-full">
                    {candidateCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="rounded-lg border bg-card p-5">
                <h3 className="font-medium mb-3">Описание</h3>
                {description ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Описание не добавлено</p>
                )}
              </div>

              <div className="rounded-lg border bg-card p-5">
                <h3 className="font-medium mb-3">Детали</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Категория</span>
                    <p className="font-medium">{vacancy.category ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Город</span>
                    <p className="font-medium">{vacancy.city ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Формат</span>
                    <p className="font-medium">{vacancy.format ? FORMAT_LABELS[vacancy.format] : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Занятость</span>
                    <p className="font-medium">{vacancy.employment ? EMPLOYMENT_LABELS[vacancy.employment] : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Создана</span>
                    <p className="font-medium">{new Date(vacancy.createdAt).toLocaleDateString("ru")}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="candidates" className="mt-4">
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Кандидаты</h3>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/hr/candidates?vacancyId=${vacancy.id}`}>
                      <Users className="w-4 h-4 mr-1" />
                      Открыть канбан
                    </Link>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {candidateCount === 0
                    ? "Откликов пока нет"
                    : `${candidateCount} кандидатов`
                  }
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
