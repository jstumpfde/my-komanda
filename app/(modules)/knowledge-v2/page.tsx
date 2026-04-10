"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Plus, Eye, BookOpen, Pencil, Trash2, Loader2, LayoutGrid, List, Search, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AiAssistantWidget } from "@/components/knowledge/ai-assistant-widget"
import { LENGTH_LABELS } from "@/lib/demo-types"
import { toast } from "sonner"

type MaterialType = "demo" | "article" | "regulation" | "course"
type ViewMode = "table" | "grid"
type TabValue = "all" | "demos" | "articles" | "regulations" | "courses"
type SortField = "updatedAt" | "createdAt" | "name" | "type" | "format" | "status"
type SortDir = "asc" | "desc"
type TypeFilter = "all" | MaterialType
type AudienceKey = "employees" | "candidates" | "clients"
type AudienceFilter = "all" | AudienceKey
type MaterialStatus = "current" | "needs_review" | "expired"
type StatusFilter = "all" | MaterialStatus

interface Material {
  id: string
  type: MaterialType
  name: string
  niche?: string
  length?: string
  lessonsCount: number
  updatedAt: string
  createdAt: string
  isSystem?: boolean
  audience?: string[]
  reviewCycle?: string
  validUntil?: string | null
}

const AUDIENCE_META: Record<AudienceKey, { emoji: string; short: string; label: string }> = {
  employees:  { emoji: "👥", short: "Сотр.",   label: "Сотрудники" },
  candidates: { emoji: "👋", short: "Канд.",   label: "Кандидаты"  },
  clients:    { emoji: "🤝", short: "Клиенты", label: "Клиенты"    },
}

const REVIEW_CYCLE_DAYS: Record<string, number> = {
  "1m":  30,
  "3m":  90,
  "6m": 180,
  "1y": 365,
}

const DAY_MS = 24 * 60 * 60 * 1000

function computeStatus(m: Material): MaterialStatus {
  const now = Date.now()
  if (m.validUntil) {
    const exp = Date.parse(m.validUntil)
    if (!isNaN(exp)) {
      if (exp < now) return "expired"
      // Within 30 days of expiry → needs review
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

const STATUS_META: Record<MaterialStatus, { label: string; badgeClass: string }> = {
  current:      { label: "Актуально",  badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  needs_review: { label: "Проверить",  badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"       },
  expired:      { label: "Устарело",   badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"                 },
}

const VIEW_STORAGE_KEY = "knowledge-view-mode"

const TYPE_META: Record<MaterialType, { label: string; badgeClass: string }> = {
  demo:       { label: "Презентация должности", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  article:    { label: "Статья",       badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  regulation: { label: "Регламент",    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  course:     { label: "Курс",         badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
}

function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "table"
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return stored === "grid" || stored === "table" ? stored : "table"
}

const EDIT_ROLES = ["platform_admin", "platform_manager", "director", "hr_lead", "hr_manager"] as const
const DELETE_ROLES = ["platform_admin", "platform_manager", "director", "hr_lead"] as const

export default function KnowledgeV2Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <KnowledgeV2PageContent />
    </Suspense>
  )
}

function KnowledgeV2PageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useAuth()
  const canCreate = (EDIT_ROLES as readonly string[]).includes(role)
  const canEdit = canCreate
  const canDelete = (DELETE_ROLES as readonly string[]).includes(role)

  const [activeTab, setActiveTab] = useState<TabValue>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sortField, setSortField] = useState<SortField>("updatedAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const handleSortHeader = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  // Hydrate view mode from localStorage after mount
  useEffect(() => { setViewMode(readStoredView()) }, [])

  // Apply ?filter=review from URL once on mount
  useEffect(() => {
    const filter = searchParams?.get("filter")
    if (filter === "review") setStatusFilter("needs_review")
  }, [searchParams])
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
        id: string; name: string; niche: string; length: string; sections: unknown[]; updatedAt: string; createdAt: string; isSystem?: boolean; audience?: string[]; reviewCycle?: string; validUntil?: string | null
      }>
      const articlesList = (articlesRes.data?.articles ?? articlesRes.articles ?? []) as Array<{
        id: string; title: string; updatedAt: string; createdAt: string; audience?: string[]; reviewCycle?: string; validUntil?: string | null
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
          createdAt: d.createdAt,
          isSystem: d.isSystem,
          audience: Array.isArray(d.audience) ? d.audience : [],
          reviewCycle: d.reviewCycle,
          validUntil: d.validUntil,
        })),
        ...articlesList.map((a) => ({
          id: a.id,
          type: "article" as const,
          name: a.title,
          lessonsCount: 0,
          updatedAt: a.updatedAt,
          createdAt: a.createdAt,
          audience: Array.isArray(a.audience) ? a.audience : [],
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

  useEffect(() => { fetchAll() }, [])

  const matchesTab = (m: Material): boolean => {
    if (activeTab === "all") return true
    if (activeTab === "demos") return m.type === "demo"
    if (activeTab === "articles") return m.type === "article"
    if (activeTab === "regulations") return m.type === "regulation"
    if (activeTab === "courses") return m.type === "course"
    return false
  }

  const filtered = materials
    .filter((m) => {
      if (!matchesTab(m)) return false
      if (typeFilter !== "all" && m.type !== typeFilter) return false
      if (audienceFilter !== "all") {
        if (!Array.isArray(m.audience) || !m.audience.includes(audienceFilter)) return false
      }
      if (statusFilter !== "all" && computeStatus(m) !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!m.name.toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortField === "name") return a.name.localeCompare(b.name, "ru") * dir
      if (sortField === "type") return a.type.localeCompare(b.type) * dir
      if (sortField === "format") {
        return (a.length ?? "").localeCompare(b.length ?? "") * dir
      }
      if (sortField === "status") {
        const order: Record<MaterialStatus, number> = { current: 0, needs_review: 1, expired: 2 }
        return (order[computeStatus(a)] - order[computeStatus(b)]) * dir
      }
      const aTime = new Date(a[sortField] || 0).getTime()
      const bTime = new Date(b[sortField] || 0).getTime()
      return (aTime - bTime) * dir
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
              <h1 className="text-2xl font-bold tracking-tight">Материалы</h1>
              <p className="text-sm text-muted-foreground mt-1">Все материалы компании в одном месте</p>
            </div>
            {canCreate && (
              <Button asChild>
                <Link href="/knowledge-v2/create">
                  <Plus className="h-4 w-4 mr-1" />Создать материал
                </Link>
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
            </div>
          ) : (
            <>
              {/* Filter row */}
              <div className="flex gap-3 items-center mb-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по названию..."
                    className="h-10 pl-9 bg-[var(--input-bg)]"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  className="h-10 px-3 rounded-md border border-border bg-background text-sm min-w-[160px]"
                >
                  <option value="all">Все типы</option>
                  <option value="demo">Презентация</option>
                  <option value="article">Статья</option>
                  <option value="regulation">Регламент</option>
                  <option value="course">Курс</option>
                </select>
                <select
                  value={audienceFilter}
                  onChange={(e) => setAudienceFilter(e.target.value as AudienceFilter)}
                  className="h-10 px-3 rounded-md border border-border bg-background text-sm min-w-[160px]"
                >
                  <option value="all">Вся аудитория</option>
                  <option value="employees">👥 Сотрудники</option>
                  <option value="candidates">👋 Кандидаты</option>
                  <option value="clients">🤝 Клиенты</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-10 px-3 rounded-md border border-border bg-background text-sm min-w-[170px]"
                >
                  <option value="all">Любой статус</option>
                  <option value="current">Актуальные</option>
                  <option value="needs_review">Требуют проверки</option>
                  <option value="expired">Устаревшие</option>
                </select>
                <select
                  value={`${sortField}:${sortDir}`}
                  onChange={(e) => {
                    const [f, d] = e.target.value.split(":")
                    setSortField(f as SortField)
                    setSortDir(d as SortDir)
                  }}
                  className="h-10 px-3 rounded-md border border-border bg-background text-sm min-w-[220px]"
                >
                  <option value="updatedAt:desc">По дате обновления ↓</option>
                  <option value="updatedAt:asc">По дате обновления ↑</option>
                  <option value="createdAt:desc">По дате создания ↓</option>
                  <option value="createdAt:asc">По дате создания ↑</option>
                  <option value="name:asc">По названию А-Я</option>
                  <option value="name:desc">По названию Я-А</option>
                </select>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="all">Все ({materials.length})</TabsTrigger>
                    <TabsTrigger value="demos">Презентации ({countsBy("demo")})</TabsTrigger>
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
                <MaterialTable
                  items={filtered}
                  onOpen={handleEditorOpen}
                  onPreview={handlePreview}
                  onDelete={setDeleteTarget}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSortClick={handleSortHeader}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((m) => (
                    <MaterialCard
                      key={`${m.type}-${m.id}`}
                      item={m}
                      onOpen={handleEditorOpen}
                      onPreview={handlePreview}
                      onDelete={setDeleteTarget}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
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

      <AiAssistantWidget />
    </SidebarProvider>
  )
}

// ─── Table view ─────────────────────────────────────────────────────────────

function SortHeader({
  label, field, sortField, sortDir, onClick, align = "left",
}: {
  label: string
  field: SortField
  sortField: SortField
  sortDir: SortDir
  onClick: (f: SortField) => void
  align?: "left" | "center" | "right"
}) {
  const active = sortField === field
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown
  return (
    <th
      onClick={() => onClick(field)}
      className={cn(
        "uppercase text-xs font-medium tracking-wider px-4 py-3 cursor-pointer select-none transition-colors hover:bg-muted",
        active ? "text-foreground" : "text-muted-foreground",
        align === "center" && "text-center",
        align === "right" && "text-right",
        align === "left" && "text-left",
      )}
    >
      <span className={cn("inline-flex items-center gap-1", align === "center" && "justify-center", align === "right" && "justify-end")}>
        {label}
        <Icon className={cn("w-3.5 h-3.5", active ? "text-foreground" : "text-muted-foreground/50")} />
      </span>
    </th>
  )
}

function MaterialTable({ items, onOpen, onPreview, onDelete, canEdit, canDelete, sortField, sortDir, onSortClick }: {
  items: Material[]
  onOpen: (m: Material) => void
  onPreview: (e: React.MouseEvent, m: Material) => void
  onDelete: (m: Material) => void
  canEdit: boolean
  canDelete: boolean
  sortField: SortField
  sortDir: SortDir
  onSortClick: (f: SortField) => void
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <table className="w-full">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <SortHeader label="Название"  field="name"      sortField={sortField} sortDir={sortDir} onClick={onSortClick} />
            <SortHeader label="Тип"        field="type"      sortField={sortField} sortDir={sortDir} onClick={onSortClick} />
            <SortHeader label="Формат"     field="format"    sortField={sortField} sortDir={sortDir} onClick={onSortClick} />
            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Аудитория</th>
            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Уроков / Страниц</th>
            <SortHeader label="Обновлено"  field="updatedAt" sortField={sortField} sortDir={sortDir} onClick={onSortClick} />
            <SortHeader label="Статус"     field="status"    sortField={sortField} sortDir={sortDir} onClick={onSortClick} />
            <th className="text-right uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const typeMeta = TYPE_META[m.type]
            const lengthInfo = m.length ? LENGTH_LABELS[m.length as keyof typeof LENGTH_LABELS] : null
            const updatedAt = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("ru-RU") : ""
            const status = computeStatus(m)
            const statusMeta = STATUS_META[status]
            const audienceKeys = (Array.isArray(m.audience) ? m.audience : []).filter(
              (k): k is AudienceKey => k === "employees" || k === "candidates" || k === "clients",
            )
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
                <td className="px-4 py-3">
                  {audienceKeys.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {audienceKeys.map((k) => (
                        <span key={k} className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
                          {AUDIENCE_META[k].emoji} {AUDIENCE_META[k].short}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                  {m.type === "demo" ? m.lessonsCount : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{updatedAt}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", statusMeta.badgeClass)}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onOpen(m) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {m.type === "demo" && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => onPreview(e, m)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && !m.isSystem && (
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

function MaterialCard({ item, onOpen, onPreview, onDelete, canEdit, canDelete }: {
  item: Material
  onOpen: (m: Material) => void
  onPreview: (e: React.MouseEvent, m: Material) => void
  onDelete: (m: Material) => void
  canEdit: boolean
  canDelete: boolean
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
        {canEdit && (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={(e) => { e.stopPropagation(); onOpen(item) }}>
            <Pencil className="h-3 w-3" />Редактировать
          </Button>
        )}
        {item.type === "demo" && (
          <Button size="sm" variant="outline" className={cn("h-8 w-8 p-0", !canEdit && "flex-1 w-auto")} onClick={(e) => onPreview(e, item)}>
            <Eye className="h-3.5 w-3.5" />
            {!canEdit && <span className="ml-1 text-xs">Просмотр</span>}
          </Button>
        )}
        {canDelete && !item.isSystem && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(item) }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
