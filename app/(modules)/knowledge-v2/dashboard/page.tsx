"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { BookOpen, CheckCircle2, AlertTriangle, XCircle, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { toast } from "sonner"

type MaterialType = "demo" | "article"
type MaterialStatus = "current" | "needs_review" | "expired"

interface Material {
  id: string
  type: MaterialType
  name: string
  updatedAt: string
  reviewCycle?: string
  validUntil?: string | null
}

const REVIEW_CYCLE_DAYS: Record<string, number> = { "1m": 30, "3m": 90, "6m": 180, "1y": 365 }
const DAY_MS = 24 * 60 * 60 * 1000

function computeStatus(m: Material): MaterialStatus {
  const now = Date.now()
  if (m.validUntil) {
    const exp = Date.parse(m.validUntil)
    if (!isNaN(exp)) {
      if (exp < now) return "expired"
      if (exp - now < 30 * DAY_MS) return "needs_review"
    }
  }
  if (m.reviewCycle && m.reviewCycle !== "none" && REVIEW_CYCLE_DAYS[m.reviewCycle]) {
    const lastCheck = Date.parse(m.updatedAt || "")
    if (!isNaN(lastCheck)) {
      const cycleMs = REVIEW_CYCLE_DAYS[m.reviewCycle] * DAY_MS
      if (now - lastCheck >= cycleMs) return "needs_review"
    }
  }
  return "current"
}

const TYPE_LABEL: Record<MaterialType, string> = {
  demo: "Презентация должности",
  article: "Статья",
}

export default function KnowledgeDashboardPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [demosRes, articlesRes] = await Promise.all([
          fetch("/api/demo-templates").then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/modules/knowledge/articles").then((r) => r.json()).catch(() => ({ data: [] })),
        ])
        const demos = (demosRes.data ?? demosRes ?? []) as Array<{
          id: string; name: string; updatedAt: string; reviewCycle?: string; validUntil?: string | null
        }>
        const articles = (articlesRes.data?.articles ?? articlesRes.articles ?? []) as Array<{
          id: string; title: string; updatedAt: string; reviewCycle?: string; validUntil?: string | null
        }>

        const merged: Material[] = [
          ...demos.map((d) => ({
            id: d.id,
            type: "demo" as const,
            name: d.name,
            updatedAt: d.updatedAt,
            reviewCycle: d.reviewCycle,
            validUntil: d.validUntil,
          })),
          ...articles.map((a) => ({
            id: a.id,
            type: "article" as const,
            name: a.title,
            updatedAt: a.updatedAt,
            reviewCycle: a.reviewCycle,
            validUntil: a.validUntil,
          })),
        ]
        setMaterials(merged)
      } catch {
        toast.error("Ошибка загрузки")
      }
      setLoading(false)
    }
    load()
  }, [])

  const total = materials.length
  const currentCount = materials.filter((m) => computeStatus(m) === "current").length
  const reviewCount = materials.filter((m) => computeStatus(m) === "needs_review").length
  const expiredCount = materials.filter((m) => computeStatus(m) === "expired").length

  const recent = [...materials]
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 10)

  const needsAttention = materials
    .filter((m) => {
      const s = computeStatus(m)
      return s === "expired" || s === "needs_review"
    })
    .sort((a, b) => {
      const sa = computeStatus(a)
      const sb = computeStatus(b)
      if (sa === "expired" && sb !== "expired") return -1
      if (sb === "expired" && sa !== "expired") return 1
      return 0
    })
    .slice(0, 6)

  const materialHref = (m: Material): string =>
    m.type === "demo"
      ? `/knowledge-v2/editor?id=${m.id}`
      : `/knowledge-v2/create/article?id=${m.id}`

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Дашборд базы знаний</h1>
              <p className="text-sm text-muted-foreground mt-1">Состояние материалов и недавние обновления</p>
            </div>
            <Button asChild>
              <Link href="/knowledge-v2/create">
                <Plus className="h-4 w-4 mr-1" />Создать материал
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Metrics row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  icon={<BookOpen className="w-5 h-5" />}
                  label="Всего материалов"
                  value={total}
                  iconClass="bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                />
                <MetricCard
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  label="Актуальные"
                  value={currentCount}
                  iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                />
                <MetricCard
                  icon={<AlertTriangle className="w-5 h-5" />}
                  label="Требуют проверки"
                  value={reviewCount}
                  iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                  href="/knowledge-v2?filter=review"
                />
                <MetricCard
                  icon={<XCircle className="w-5 h-5" />}
                  label="Устаревшие"
                  value={expiredCount}
                  iconClass="bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                />
              </div>

              {/* Needs attention */}
              {needsAttention.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold mb-3">Требуют внимания</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {needsAttention.map((m) => {
                      const status = computeStatus(m)
                      const borderClass = status === "expired"
                        ? "border-red-300 dark:border-red-900/50"
                        : "border-amber-300 dark:border-amber-900/50"
                      const badgeClass = status === "expired"
                        ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      const updated = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("ru-RU") : ""
                      const validUntil = m.validUntil ? new Date(m.validUntil).toLocaleDateString("ru-RU") : null
                      return (
                        <div key={`${m.type}-${m.id}`} className={cn("rounded-xl border-2 p-4 bg-card", borderClass)}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-sm font-medium truncate flex-1">{m.name}</p>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", badgeClass)}>
                              {status === "expired" ? "Устарело" : "Проверить"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
                            <div>{TYPE_LABEL[m.type]}</div>
                            {validUntil && <div>Актуально до {validUntil}</div>}
                            {updated && <div>Обновлено {updated}</div>}
                          </div>
                          <Button asChild variant="outline" size="sm" className="h-8 w-full">
                            <Link href={materialHref(m)}>Обновить</Link>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Recent updates */}
              <section>
                <h2 className="text-base font-semibold mb-3">Последние обновления</h2>
                {recent.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    Пока нет материалов.{" "}
                    <Link href="/knowledge-v2/create" className="text-primary hover:underline">Создайте первый</Link>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden bg-card">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Название</th>
                          <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Тип</th>
                          <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Обновлено</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((m) => {
                          const updated = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("ru-RU") : ""
                          return (
                            <tr key={`${m.type}-${m.id}`} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium">
                                <Link href={materialHref(m)} className="hover:text-primary transition-colors">
                                  {m.name}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{TYPE_LABEL[m.type]}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{updated}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function MetricCard({
  icon, label, value, iconClass, href,
}: {
  icon: React.ReactNode
  label: string
  value: number
  iconClass: string
  href?: string
}) {
  const body = (
    <div className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", iconClass)}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
