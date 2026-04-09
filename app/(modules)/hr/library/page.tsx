"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Eye, BookOpen, Pencil, Trash2, Loader2, LayoutGrid, List } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS } from "@/lib/demo-types"
import { toast } from "sonner"

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

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState("my")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTemplates = () => {
    setLoading(true)
    fetch("/api/demo-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = data.data ?? data
        setTemplates(Array.isArray(rows) ? rows : [])
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }

  useEffect(() => { fetchTemplates() }, [])

  const systemTemplates = templates.filter((t) => t.isSystem)
  const myTemplates = templates.filter((t) => !t.isSystem)

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

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Библиотека демонстраций</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Шаблоны для демонстраций должности кандидатам
              </p>
            </div>
            <Button asChild>
              <Link href="/hr/library/create">
                <Plus className="h-4 w-4 mr-1" />
                Создать демонстрацию
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="my">Мои шаблоны ({myTemplates.length})</TabsTrigger>
                  <TabsTrigger value="system">Системные ({systemTemplates.length})</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
                  <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <TabsContent value="my">
                {myTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      Нет шаблонов. Создайте первый!
                    </p>
                    <Button asChild className="mt-2">
                      <Link href="/hr/library/create">
                        <Plus className="h-4 w-4 mr-1" />
                        Создать первый шаблон
                      </Link>
                    </Button>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myTemplates.map((template) => (
                      <TemplateCard key={template.id} template={template} onDelete={() => setDeleteId(template.id)} />
                    ))}
                  </div>
                ) : (
                  <TemplateTable templates={myTemplates} onDelete={(id) => setDeleteId(id)} />
                )}
              </TabsContent>

              <TabsContent value="system">
                {systemTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Системные шаблоны пока недоступны</p>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {systemTemplates.map((template) => (
                      <TemplateCard key={template.id} template={template} />
                    ))}
                  </div>
                ) : (
                  <TemplateTable templates={systemTemplates} />
                )}
              </TabsContent>
            </Tabs>
          )}
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

function TemplateCard({ template, onDelete }: { template: TemplateData; onDelete?: () => void }) {
  const nicheInfo = NICHE_LABELS[template.niche]
  const lengthInfo = LENGTH_LABELS[template.length]
  const lessonsCount = Array.isArray(template.sections) ? template.sections.length : 0
  const updatedAt = template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("ru-RU") : ""
  const firstEmoji = Array.isArray(template.sections) && template.sections.length > 0
    ? (template.sections[0] as { emoji?: string })?.emoji || "📄"
    : "📄"

  return (
    <Link href={`/hr/library/create/editor?id=${template.id}`}>
      <div className="rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group bg-card">
        {/* Row 1: Emoji + Title */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl shrink-0">{firstEmoji}</span>
          <p className="text-base font-medium text-foreground group-hover:text-primary transition-colors truncate">{template.name}</p>
        </div>

        {/* Row 2: Pill badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {nicheInfo && (
            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 px-2.5 py-0.5 text-xs font-medium">{nicheInfo.label}</span>
          )}
          {lengthInfo && (
            <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 px-2.5 py-0.5 text-xs font-medium">{lengthInfo.label}</span>
          )}
          <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
            {lessonsCount} {lessonsCount === 1 ? "урок" : lessonsCount < 5 ? "урока" : "уроков"}
          </span>
          {template.isSystem && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium">Системный</span>
          )}
        </div>

        {/* Row 3: Date */}
        {updatedAt && (
          <p className="text-xs text-muted-foreground mb-4">Обновлено {updatedAt}</p>
        )}

        {/* Row 4: Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1">
            <Pencil className="h-3 w-3" />Редактировать
          </Button>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" asChild onClick={(e) => e.stopPropagation()}>
            <Link href={`/hr/library/preview/${template.id}`} target="_blank">
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {!template.isSystem && onDelete && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Link>
  )
}

function TemplateTable({ templates, onDelete }: { templates: TemplateData[]; onDelete?: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <table className="w-full">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Название</th>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Формат</th>
            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Уроков</th>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Обновлено</th>
            <th className="text-right uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => {
            const lengthInfo = LENGTH_LABELS[template.length]
            const lessonsCount = Array.isArray(template.sections) ? template.sections.length : 0
            const updatedAt = template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("ru-RU") : ""
            const firstEmoji = Array.isArray(template.sections) && template.sections.length > 0
              ? (template.sections[0] as { emoji?: string })?.emoji || "📄"
              : "📄"
            return (
              <tr key={template.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                <td className="px-4 py-3">
                  <Link href={`/hr/library/create/editor?id=${template.id}`} className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{firstEmoji}</span>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-sm">{template.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {lengthInfo && <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 px-2 py-0.5 text-[10px] font-medium">{lengthInfo.label}</span>}
                </td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">{lessonsCount}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{updatedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                      <Link href={`/hr/library/create/editor?id=${template.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                      <Link href={`/hr/library/preview/${template.id}`} target="_blank"><Eye className="h-3.5 w-3.5" /></Link>
                    </Button>
                    {!template.isSystem && onDelete && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(template.id)}>
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
  )
}
