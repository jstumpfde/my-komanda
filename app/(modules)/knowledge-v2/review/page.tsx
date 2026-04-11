"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ClipboardCheck, Loader2, Pencil, CheckCircle2, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Article {
  id: string
  title: string
  status: string
  updatedAt: string
  validUntil: string | null
  reviewCycle: string | null
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  review: { label: "На проверке", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  expired: { label: "Устарел", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

export default function KnowledgeReviewPage() {
  const [items, setItems] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [reviewRes, expiredRes] = await Promise.all([
        fetch("/api/modules/knowledge/articles?status=review&limit=100"),
        fetch("/api/modules/knowledge/articles?status=expired&limit=100"),
      ])
      const reviewData = reviewRes.ok ? await reviewRes.json() : { articles: [] }
      const expiredData = expiredRes.ok ? await expiredRes.json() : { articles: [] }
      const merged = [...(reviewData.articles ?? []), ...(expiredData.articles ?? [])] as Article[]
      merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      setItems(merged)
    } catch {
      toast.error("Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleConfirm(id: string) {
    setConfirming(id)
    try {
      const res = await fetch(`/api/modules/knowledge/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      })
      if (!res.ok) {
        toast.error("Не удалось подтвердить")
        return
      }
      toast.success("Материал помечен актуальным")
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setConfirming(null)
    }
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
              <Link href="/knowledge-v2" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">На проверке</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="size-5 text-amber-500" />
                  <h1 className="text-xl font-semibold">На проверке</h1>
                  {items.length > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                      {items.length}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Материалы, которые устарели или требуют ревизии
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Загрузка...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <CheckCircle2 className="size-8 mx-auto mb-3 text-emerald-500" />
                <p className="text-sm font-medium mb-1">Все материалы актуальны</p>
                <p className="text-xs text-muted-foreground">
                  Когда агент контроля актуальности найдёт устаревшие материалы, они появятся здесь.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden bg-card">
                <table className="w-full">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-4 py-3">Название</th>
                      <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-4 py-3 w-32">Статус</th>
                      <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-4 py-3 w-36">Обновлено</th>
                      <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-4 py-3 w-36">Valid until</th>
                      <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-4 py-3 w-56">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((a) => {
                      const meta = STATUS_META[a.status] ?? STATUS_META.review
                      return (
                        <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium">{a.title}</div>
                            {a.reviewCycle && a.reviewCycle !== "none" && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Цикл ревью: {a.reviewCycle}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={cn("text-[10px]", meta.className)}>
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(a.updatedAt)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(a.validUntil)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <Link href={`/knowledge-v2/editor?id=${a.id}&type=article`}>
                                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                                  <Pencil className="size-3" />
                                  Обновить
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => handleConfirm(a.id)}
                                disabled={confirming === a.id}
                              >
                                {confirming === a.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="size-3" />
                                )}
                                Подтвердить актуальность
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
