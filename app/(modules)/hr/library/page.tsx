"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Eye, Pencil, Trash2, Loader2, Copy, BookOpen, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS } from "@/lib/demo-types"
import { toast } from "sonner"

// ─── Types ──────────────────────────────────────────────────────────────────

interface TemplateData {
  id: string
  name: string
  niche: string
  length: string
  isSystem: boolean
  sections: unknown[]
  createdAt: string
  updatedAt: string
}

interface QuestionnaireTemplate {
  id: string
  name: string
  type: "candidate" | "client" | "post_demo"
  questionsCount: number
  requiredCount: number
  createdAt: string
  usageCount: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  candidate: { label: "Кандидат", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
  client: { label: "Заказчик", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  post_demo: { label: "После демо", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
}

const LENGTH_BADGE: Record<string, { label: string; cls: string }> = {
  short: { label: "Короткая", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  medium: { label: "Средняя", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  long: { label: "Длинная", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
}

// ─── Mock questionnaire data ────────────────────────────────────────────────

const MOCK_QUESTIONNAIRES: QuestionnaireTemplate[] = [
  { id: "q1", name: "Анкета кандидата — базовая", type: "candidate", questionsCount: 12, requiredCount: 8, createdAt: "2026-04-12T10:00:00Z", usageCount: 7 },
  { id: "q2", name: "Анкета кандидата — расширенная", type: "candidate", questionsCount: 25, requiredCount: 15, createdAt: "2026-04-11T10:00:00Z", usageCount: 3 },
  { id: "q3", name: "Анкета заказчика (intake)", type: "client", questionsCount: 10, requiredCount: 10, createdAt: "2026-04-10T10:00:00Z", usageCount: 2 },
  { id: "q4", name: "Опрос после демонстрации", type: "post_demo", questionsCount: 8, requiredCount: 5, createdAt: "2026-04-09T10:00:00Z", usageCount: 4 },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [questionnaires] = useState<QuestionnaireTemplate[]>(MOCK_QUESTIONNAIRES)

  const fetchTemplates = () => {
    setLoading(true)
    fetch("/api/demo-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = data.data ?? data
        setTemplates(Array.isArray(rows) ? rows : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/demo-templates/${deleteId}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Шаблон удалён")
        setTemplates((prev) => prev.filter((t) => t.id !== deleteId))
      } else {
        toast.error("Ошибка удаления")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setDeleting(false)
    setDeleteId(null)
  }

  const formatDate = (d: string) => {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Библиотека</h1>
              <p className="text-sm text-muted-foreground mt-1">Шаблоны демонстраций и анкет</p>
            </div>

            {/* ═══ Block 1: Демонстрации ═══ */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-base">Шаблоны демонстраций</CardTitle>
                    {!loading && <Badge variant="secondary" className="text-[10px]">{templates.length}</Badge>}
                  </div>
                  <Button size="sm" className="gap-1.5 h-8 text-xs" asChild>
                    <Link href="/hr/library/create">
                      <Plus className="h-3.5 w-3.5" />Создать шаблон
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />Загрузка...
                  </div>
                ) : templates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-2">Нет шаблонов демонстраций</p>
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/hr/library/create"><Plus className="h-3.5 w-3.5 mr-1" />Создать первый</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-auto" style={{ maxHeight: "40vh" }}>
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-t border-border sticky top-0">
                        <tr>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Название</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[100px]">Тип</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[160px]">Должность</th>
                          <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[100px]">Длительность</th>
                          <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[70px]">Блоков</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Создан</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {templates.map((t) => {
                          const lengthInfo = LENGTH_LABELS[t.length as keyof typeof LENGTH_LABELS]
                          const nicheInfo = NICHE_LABELS[t.niche as keyof typeof NICHE_LABELS]
                          const lb = LENGTH_BADGE[t.length]
                          const sectionsCount = Array.isArray(t.sections) ? t.sections.length : 0
                          const firstEmoji = Array.isArray(t.sections) && t.sections.length > 0
                            ? (t.sections[0] as { emoji?: string })?.emoji || "📄" : "📄"
                          return (
                            <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                              <td className="px-4 py-2.5">
                                <Link href={`/hr/library/create/editor?id=${t.id}`} className="flex items-center gap-2 min-w-0">
                                  <span className="text-base shrink-0">{firstEmoji}</span>
                                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{t.name}</span>
                                  {t.isSystem && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 shrink-0">Системный</Badge>}
                                </Link>
                              </td>
                              <td className="px-4 py-2.5">
                                {lb && <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", lb.cls)}>{lb.label}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground truncate max-w-[160px]">{nicheInfo?.label || "—"}</td>
                              <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{lengthInfo?.label || "—"}</td>
                              <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{sectionsCount}</td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(t.createdAt)}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-0.5 justify-end">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                                    <Link href={`/hr/library/preview/${t.id}`} target="_blank"><Eye className="h-3.5 w-3.5" /></Link>
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                                    <Link href={`/hr/library/create/editor?id=${t.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast.success("Шаблон скопирован")}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  {!t.isSystem && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ═══ Block 2: Анкеты ═══ */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-base">Шаблоны анкет</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{questionnaires.length}</Badge>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => toast("Создание шаблонов анкет — в разработке")}>
                    <Plus className="h-3.5 w-3.5" />Создать шаблон
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {questionnaires.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Нет шаблонов анкет</p>
                  </div>
                ) : (
                  <div className="overflow-auto" style={{ maxHeight: "40vh" }}>
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-t border-border sticky top-0">
                        <tr>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Название</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Тип</th>
                          <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[90px]">Вопросов</th>
                          <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Обязат.</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Создан</th>
                          <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Использ.</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {questionnaires.map((q) => {
                          const tb = TYPE_BADGE[q.type]
                          return (
                            <tr key={q.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                              <td className="px-4 py-2.5">
                                <span className="text-sm font-medium text-foreground">{q.name}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                {tb && <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", tb.cls)}>{tb.label}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{q.questionsCount}</td>
                              <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{q.requiredCount}</td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(q.createdAt)}</td>
                              <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{q.usageCount}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-0.5 justify-end">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast("Просмотр анкеты — в разработке")}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast("Редактирование анкеты — в разработке")}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast("Шаблон скопирован")}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => toast("Удаление анкеты — в разработке")}>
                                    <Trash2 className="h-3.5 w-3.5" />
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
              </CardContent>
            </Card>

          </div>
        </div>
      </SidebarInset>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Удалить шаблон?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Шаблон будет удалён без возможности восстановления.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
