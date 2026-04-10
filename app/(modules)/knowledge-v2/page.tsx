"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Eye, BookOpen, Pencil, Trash2, Loader2, LayoutGrid, List } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS } from "@/lib/demo-types"
import { toast } from "sonner"

type MaterialType = "demo" | "article" | "regulation" | "course"
type ViewMode = "table" | "grid"
type TabValue = "all" | "demos" | "articles" | "regulations" | "courses"

interface Material {
  id: string
  type: MaterialType
  name: string
  niche?: string
  length?: string
  lessonsCount: number
  updatedAt: string
  isSystem?: boolean
}

const VIEW_STORAGE_KEY = "knowledge-view-mode"

const TYPE_META: Record<MaterialType, { label: string; badgeClass: string }> = {
  demo:       { label: "Демонстрация", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  article:    { label: "Статья",       badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  regulation: { label: "Регламент",    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  course:     { label: "Курс",         badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
}

function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "table"
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return stored === "grid" || stored === "table" ? stored : "table"
}

export default function KnowledgeV2Page() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabValue>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Hydrate view mode from localStorage after mount
  useEffect(() => { setViewMode(readStoredView()) }, [])
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [demosRes, articlesRes] = await Promise.all([
        fetch("/api/demo-templates").then((r) => r.json()).catch(() => ({ data: [] })),
        fetch("/api/modules/knowledge/articles").then((r) => r.json()).catch(() => ({ data: [] })),
      ])
      const demos = (demosRes.data ?? demosRes ?? []) as Array<{
        id: string; name: string; niche: string; length: string; sections: unknown[]; updatedAt: string; isSystem?: boolean
      }>
      const articlesList = (articlesRes.data?.articles ?? articlesRes.articles ?? []) as Array<{
        id: string; title: string; updatedAt: string
      }>

      const merged: Material[] = [
        ...demos.map((d) => ({
          id: d.id,
          type: "demo" as const,
          name: d.name,
          niche: d.niche,
          length: d.length,
          lessonsCount: Array.isArray(d.sections) ? d.sections.length : 0,
          updatedAt: d.updatedAt,
          isSystem: d.isSystem,
        })),
        ...articlesList.map((a) => ({
          id: a.id,
          type: "article" as const,
          name: a.title,
          lessonsCount: 0,
          updatedAt: a.updatedAt,
        })),
      ]
      setMaterials(merged)
    } catch {
      toast.error("Ошибка загрузки")
    }
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const filtered = materials.filter((m) => {
    if (activeTab === "all") return true
    if (activeTab === "demos") return m.type === "demo"
    if (activeTab === "articles") return m.type === "article"
    if (activeTab === "regulations") return m.type === "regulation"
    if (activeTab === "courses") return m.type === "course"
    return false
  })

  const countsBy = (type: MaterialType) => materials.filter((m) => m.type === type).length

  const handleEditorOpen = (m: Material) => {
    if (m.type === "demo") router.push(`/knowledge-v2/editor?id=${m.id}`)
    if (m.type === "article") router.push(`/knowledge-v2/create/article?id=${m.id}`)
  }

  const handlePreview = (e: React.MouseEvent, m: Material) => {
    e.stopPropagation()
    if (m.type === "demo") window.open(`/hr/library/preview/${m.id}`, "_blank")
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const url = deleteTarget.type === "demo"
        ? `/api/demo-templates/${deleteTarget.id}`
        : `/api/modules/knowledge/articles/${deleteTarget.id}`
      const res = await fetch(url, { method: "DELETE" })
      if (res.ok) {
        toast.success("Удалено")
        setMaterials((prev) => prev.filter((m) => !(m.id === deleteTarget.id && m.type === deleteTarget.type)))
      } else {
        toast.error("Ошибка удаления")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setDeleting(false)
    setDeleteTarget(null)
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
              <h1 className="text-2xl font-bold tracking-tight">База знаний</h1>
              <p className="text-sm text-muted-foreground mt-1">Все материалы компании в одном месте</p>
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
            <>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="all">Все ({materials.length})</TabsTrigger>
                    <TabsTrigger value="demos">Демонстрации ({countsBy("demo")})</TabsTrigger>
                    <TabsTrigger value="articles">Статьи ({countsBy("article")})</TabsTrigger>
                    <TabsTrigger value="regulations" className="gap-1.5">
                      Регламенты
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Скоро</span>
                    </TabsTrigger>
                    <TabsTrigger value="courses" className="gap-1.5">
                      Курсы
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Скоро</span>
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
                    <button onClick={() => setViewMode("table")} className={cn("p-1.5 rounded-md transition-colors", viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      <List className="w-4 h-4" />
                    </button>
                    <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Tabs>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">Нет материалов</p>
                  <p className="text-sm text-muted-foreground mb-4">Создайте первый документ</p>
                  <Button asChild>
                    <Link href="/knowledge-v2/create">
                      <Plus className="h-4 w-4 mr-1" />Создать
                    </Link>
                  </Button>
                </div>
              ) : viewMode === "table" ? (
                <MaterialTable items={filtered} onOpen={handleEditorOpen} onPreview={handlePreview} onDelete={setDeleteTarget} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((m) => (
                    <MaterialCard key={`${m.type}-${m.id}`} item={m} onOpen={handleEditorOpen} onPreview={handlePreview} onDelete={setDeleteTarget} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SidebarInset>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Удалить материал?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Материал будет удалён без возможности восстановления.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Отмена</Button>
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

// ─── Table view ─────────────────────────────────────────────────────────────

function MaterialTable({ items, onOpen, onPreview, onDelete }: {
  items: Material[]
  onOpen: (m: Material) => void
  onPreview: (e: React.MouseEvent, m: Material) => void
  onDelete: (m: Material) => void
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <table className="w-full">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Название</th>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Тип</th>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Формат</th>
            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Уроков / Страниц</th>
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Обновлено</th>
            <th className="text-right uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const typeMeta = TYPE_META[m.type]
            const lengthInfo = m.length ? LENGTH_LABELS[m.length as keyof typeof LENGTH_LABELS] : null
            const updatedAt = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("ru-RU") : ""
            return (
              <tr
                key={`${m.type}-${m.id}`}
                className="border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => onOpen(m)}
              >
                <td className="px-4 py-3 text-sm font-medium truncate max-w-sm">{m.name}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", typeMeta.badgeClass)}>
                    {typeMeta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {lengthInfo?.label ?? "—"}
                </td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                  {m.type === "demo" ? m.lessonsCount : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{updatedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onOpen(m) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {m.type === "demo" && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => onPreview(e, m)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!m.isSystem && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(m) }}>
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

// ─── Card view ──────────────────────────────────────────────────────────────

function MaterialCard({ item, onOpen, onPreview, onDelete }: {
  item: Material
  onOpen: (m: Material) => void
  onPreview: (e: React.MouseEvent, m: Material) => void
  onDelete: (m: Material) => void
}) {
  const typeMeta = TYPE_META[item.type]
  const lengthInfo = item.length ? LENGTH_LABELS[item.length as keyof typeof LENGTH_LABELS] : null
  const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("ru-RU") : ""

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item) } }}
      className="rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-base font-medium text-foreground group-hover:text-primary transition-colors truncate flex-1">{item.name}</p>
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", typeMeta.badgeClass)}>
          {typeMeta.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {lengthInfo && (
          <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 px-2.5 py-0.5 text-xs font-medium">
            {lengthInfo.label}
          </span>
        )}
        {item.type === "demo" && (
          <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
            {item.lessonsCount} {item.lessonsCount === 1 ? "урок" : item.lessonsCount < 5 ? "урока" : "уроков"}
          </span>
        )}
        {item.isSystem && (
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium">Системный</span>
        )}
      </div>

      {updatedAt && <p className="text-xs text-muted-foreground mb-4">Обновлено {updatedAt}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={(e) => { e.stopPropagation(); onOpen(item) }}>
          <Pencil className="h-3 w-3" />Редактировать
        </Button>
        {item.type === "demo" && (
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={(e) => onPreview(e, item)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {!item.isSystem && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(item) }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
