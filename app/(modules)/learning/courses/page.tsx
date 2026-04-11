"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronRight, Plus, Sparkles, BookOpen, FileText, Coins, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { WorkshopLauncher } from "@/components/core/workshop-launcher"

// ─── Project shape (API) ────────────────────────────────────────────────────

interface SourceLike { type?: string }
interface ResultLike {
  modules?: { lessons?: unknown[] }[]
}

interface AiCourseProject {
  id: string
  title: string
  description: string | null
  status: string
  sources: SourceLike[] | null
  result: ResultLike | null
  tokensInput: number | null
  tokensOutput: number | null
  costUsd: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:      { label: "Черновик",   className: "bg-muted text-muted-foreground" },
  generating: { label: "Генерация",  className: "bg-blue-500/15 text-blue-700 animate-pulse" },
  ready:      { label: "Готов",      className: "bg-emerald-500/15 text-emerald-700" },
  published:  { label: "Опубликован", className: "bg-violet-500/15 text-violet-700" },
}

function formatTokens(n: number): string {
  if (n === 0) return "0"
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiCoursesListPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<AiCourseProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/modules/knowledge/ai-courses")
        if (res.ok) {
          const data = (await res.json()) as AiCourseProject[]
          setProjects(Array.isArray(data) ? data : [])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch("/api/modules/knowledge/ai-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Новый AI-курс" }),
      })
      const data = (await res.json()) as AiCourseProject & { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось создать")
        return
      }
      router.push(`/learning/courses/${data.id}`)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setCreating(false)
    }
  }

  function sourcesCount(p: AiCourseProject): number {
    return Array.isArray(p.sources) ? p.sources.length : 0
  }

  function lessonsCount(p: AiCourseProject): number {
    if (!p.result?.modules) return 0
    return p.result.modules.reduce(
      (sum, m) => sum + (Array.isArray(m.lessons) ? m.lessons.length : 0),
      0,
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
              <Link href="/learning/dashboard" className="hover:text-foreground transition-colors">Обучение</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">AI-курсы</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-violet-500" />
                <h1 className="text-xl font-semibold">AI-курсы</h1>
              </div>
              <div className="flex items-center gap-2">
                <WorkshopLauncher
                  moduleContext="learning"
                  buttonVariant="outline"
                />
                <Button className="gap-1.5" onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Новый AI-курс
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Загрузка...
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Sparkles className="size-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Пока нет AI-курсов</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Создайте первый — добавьте YouTube видео, статьи или файлы, и AI соберёт структурированный курс с тестами.
                </p>
                <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Создать AI-курс
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {projects.map((p) => {
                  const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft
                  const srcCnt = sourcesCount(p)
                  const lsnCnt = lessonsCount(p)
                  const tokensTotal = (p.tokensInput ?? 0) + (p.tokensOutput ?? 0)
                  return (
                    <Link
                      key={p.id}
                      href={`/learning/courses/${p.id}`}
                      className="group block border rounded-xl p-5 bg-card transition-all hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1">
                          {p.title}
                        </h3>
                        <Badge variant="secondary" className={cn("text-[10px] shrink-0 ml-2", st.className)}>
                          {st.label}
                        </Badge>
                      </div>

                      {p.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-4">{p.description}</p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <FileText className="size-3" />
                          {srcCnt} источн.
                        </span>
                        {lsnCnt > 0 && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="size-3" />
                            {lsnCnt} уроков
                          </span>
                        )}
                        {Number(p.costUsd) > 0 && (
                          <span className="flex items-center gap-1">
                            <Coins className="size-3" />
                            {formatTokens(tokensTotal)} токенов · ${p.costUsd}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground">
                        {formatDate(p.createdAt)}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
