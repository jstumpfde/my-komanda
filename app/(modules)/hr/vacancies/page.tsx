"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useVacancies, type ApiVacancy } from "@/hooks/use-vacancies"
import {
  Plus, Briefcase, MapPin, List, LayoutGrid, Table2, Calendar, Banknote,
  Search, MoreHorizontal, Pencil, Copy, Archive, Trash2, ListFilter,
  RotateCcw, X, Upload, Link2, FileText, Loader2, CheckCircle2, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { parseVacancyText } from "@/lib/parse-vacancy-text"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  draft: "Черновик",
  published: "Опубликована",
  paused: "Приостановлена",
  closed: "Закрыта",
  archived: "Архив",
}

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  draft:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  paused:    "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  closed:    "bg-muted text-muted-foreground",
  archived:  "bg-muted text-muted-foreground",
}

const STATUS_ORDER: Record<string, number> = {
  active: 0, published: 1, draft: 2, paused: 3, closed: 4, archived: 5,
}

const STATUS_FILTER_OPTIONS = [
  { value: "all",       label: "Все статусы" },
  { value: "draft",     label: "Черновик" },
  { value: "published", label: "Опубликована" },
  { value: "active",    label: "Активна" },
  { value: "paused",    label: "На паузе" },
  { value: "closed",    label: "Закрыта" },
]

type ViewMode = "list" | "tiles" | "table"
type ColumnSort = { column: string; dir: "asc" | "desc" } | null

const VIEW_MODES: { value: ViewMode; icon: typeof List; label: string }[] = [
  { value: "list",  icon: List,       label: "Список" },
  { value: "tiles", icon: LayoutGrid, label: "Плитки" },
  { value: "table", icon: Table2,     label: "Таблица" },
]

const FILTER_INPUT = "h-10 text-sm border border-gray-300 rounded-lg"

// Roles that always see trash (vacancies_delete: "full" in permission matrix)
const TRASH_ROLES_ALWAYS = ["platform_admin", "platform_manager", "director", "hr_lead", "admin"]
// Additional role that can see trash if enabled in settings
const TRASH_ROLE_OPTIONAL = "hr_manager"
const TRASH_ACCESS_KEY = "mk_trash_access_hr_manager"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string | null {
  const fmt = (n: number) => n.toLocaleString("ru-RU")
  if (min && max) return `${fmt(min)} — ${fmt(max)} ₽`
  if (min) return `от ${fmt(min)} ₽`
  if (max) return `до ${fmt(max)} ₽`
  return null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
}

// ─── Shared components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "draft"
  return (
    <Badge variant="outline" className={cn("border-0 text-xs shrink-0", STATUS_COLORS[s])}>
      {STATUS_LABELS[s] ?? s}
    </Badge>
  )
}

function HrAvatar({ name }: { name: string }) {
  const isUnassigned = !name || name === "Не назначен"
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px] bg-muted">
          {isUnassigned ? "?" : getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground">{isUnassigned ? "Не назначен" : name}</span>
    </div>
  )
}

function getHrName(createdBy: string, team: TeamMember[]): string {
  const member = team.find((m) => m.id === createdBy)
  return member?.name ?? "Не назначен"
}

/** Sortable column header with funnel icon */
function SortableHeader({
  label, column, current, onToggle,
}: {
  label: string
  column: string
  current: ColumnSort
  onToggle: (col: string) => void
}) {
  const isActive = current?.column === column
  const dir = isActive ? current.dir : null

  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold select-none transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <ListFilter
        className={cn(
          "size-4 transition-transform",
          dir === "desc" && "scale-y-[-1]",
          !isActive && "opacity-40",
        )}
      />
      {label}
    </button>
  )
}

// ─── Row actions ─────────────────────────────────────────────────────────────

function RowActions({
  v, onDuplicate, onArchive, onDelete,
}: {
  v: ApiVacancy
  onDuplicate: (v: ApiVacancy) => void
  onArchive: (v: ApiVacancy) => void
  onDelete: (v: ApiVacancy) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.location.href = `/hr/vacancies/${v.id}/edit` }}>
          <Pencil className="size-4 mr-2" />Редактировать
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(v) }}>
          <Copy className="size-4 mr-2" />Дублировать
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(v) }}>
          <Archive className="size-4 mr-2" />В архив
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(v) }}
        >
          <Trash2 className="size-4 mr-2" />В корзину
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── List view ───────────────────────────────────────────────────────────────

function VacancyListItem({ v, selected, onToggle, team, actions }: {
  v: ApiVacancy; selected: boolean; onToggle: () => void; team: TeamMember[]
  actions: { onDuplicate: (v: ApiVacancy) => void; onArchive: (v: ApiVacancy) => void; onDelete: (v: ApiVacancy) => void }
}) {
  const salary = formatSalary(v.salaryMin, v.salaryMax)
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors group">
      <Checkbox checked={selected} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} className="shrink-0" />
      <Link href={`/hr/vacancies/${v.id}`} className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Briefcase className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{v.title}</p>
          <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
            {v.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{v.city}</span>}
            {salary && <span className="flex items-center gap-1"><Banknote className="size-3.5" />{salary}</span>}
            <span className="flex items-center gap-1"><Calendar className="size-3.5" />{formatDate(v.createdAt)}</span>
          </div>
        </div>
        <HrAvatar name={getHrName(v.createdBy, team)} />
        <StatusBadge status={v.status} />
      </Link>
      <RowActions v={v} {...actions} />
    </div>
  )
}

// ─── Tiles view ──────────────────────────────────────────────────────────────

function VacancyTile({ v, selected, onToggle, team, actions }: {
  v: ApiVacancy; selected: boolean; onToggle: () => void; team: TeamMember[]
  actions: { onDuplicate: (v: ApiVacancy) => void; onArchive: (v: ApiVacancy) => void; onDelete: (v: ApiVacancy) => void }
}) {
  const salary = formatSalary(v.salaryMin, v.salaryMax)
  return (
    <div className="flex flex-col p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors group relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggle} className="shrink-0" />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Briefcase className="size-4" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={v.status} />
          <RowActions v={v} {...actions} />
        </div>
      </div>
      <Link href={`/hr/vacancies/${v.id}`} className="flex-1">
        <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors mb-1">{v.title}</p>
        <div className="space-y-1 text-sm text-muted-foreground mb-3">
          {v.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{v.city}</span>}
          {salary && <span className="flex items-center gap-1"><Banknote className="size-3.5" />{salary}</span>}
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
        <HrAvatar name={getHrName(v.createdBy, team)} />
        <span className="text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function VacanciesPage() {
  const router = useRouter()
  const { role } = useAuth()
  const { vacancies, total, loading, refetch } = useVacancies(1, 50)
  const [view, setView] = useState<ViewMode>("table")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [hrFilter, setHrFilter] = useState("all")
  const [colSort, setColSort] = useState<ColumnSort>({ column: "date", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [deleteTarget, setDeleteTarget] = useState<ApiVacancy | null>(null)
  // Trash
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashItems, setTrashItems] = useState<ApiVacancy[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ApiVacancy | null>(null)
  // Create vacancy dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newVacancyTitle, setNewVacancyTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [uploadedFile, setUploadedFile] = useState<{ name: string; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedText, setImportedText] = useState("")
  const [aiText, setAiText] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetCreateDialog = useCallback(() => {
    setNewVacancyTitle("")
    setImportUrl("")
    setUploadedFile(null)
    setImportedText("")
    setAiText("")
  }, [])

  const handleFileUpload = useCallback(async (file: File) => {
    const name = file.name.toLowerCase()
    if (!name.endsWith(".txt") && !name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".doc")) {
      toast.error("Неподдерживаемый формат. Используйте DOCX, PDF или TXT")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл слишком большой (максимум 10 МБ)")
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/modules/hr/vacancies/parse-file", { method: "POST", body: formData })
      const data = await res.json() as { text?: string; fileName?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Ошибка")
      setUploadedFile({ name: file.name, text: data.text ?? "" })
      // Auto-fill title from file name if empty or very short
      const titleFromFile = file.name.replace(/\.(docx?|pdf|txt)$/i, "").trim()
      if (titleFromFile && newVacancyTitle.trim().length < 3) {
        setNewVacancyTitle(titleFromFile)
      }
      toast.success(`Файл "${file.name}" обработан`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка обработки файла")
    } finally {
      setUploading(false)
    }
  }, [newVacancyTitle])

  const handleImportUrl = useCallback(async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    try {
      toast("Импорт из ссылки будет доступен в ближайшем обновлении")
    } finally {
      setImporting(false)
    }
  }, [importUrl])

  const handleCreateVacancy = useCallback(async () => {
    if (!newVacancyTitle.trim()) { toast.error("Введите название вакансии"); return }
    setCreating(true)
    try {
      // Build description_json with parsed file text if available
      const descriptionJson: Record<string, unknown> = {}
      const fileText = uploadedFile?.text || importedText
      if (fileText) {
        const parsed = parseVacancyText(fileText)
        descriptionJson.anketa = {
          vacancyTitle: newVacancyTitle.trim(),
          // 2. Должность
          positionCategory: parsed.positionCategory,
          workFormats: parsed.workFormats,
          employment: parsed.employment,
          positionCity: parsed.positionCity,
          // 3. Мотивация
          salaryFrom: parsed.salaryFrom,
          salaryTo: parsed.salaryTo,
          bonus: parsed.bonus,
          // 4. Обязанности
          responsibilities: parsed.responsibilities,
          requirements: parsed.requirements,
          // 5. Портрет
          requiredSkills: parsed.requiredSkills,
          experienceMin: parsed.experienceMin,
          // 6. Условия
          conditions: parsed.conditions,
          conditionsCustom: parsed.conditionsCustom,
        }
        descriptionJson.importedFrom = uploadedFile ? { type: "file", fileName: uploadedFile.name } : { type: "url", url: importUrl }
        if (parsed.companyDescription) {
          descriptionJson.companyDescription = parsed.companyDescription
        }
        // Store stop factors & desired params for anketa migration
        if (Object.keys(parsed.stopFactors).length > 0) {
          (descriptionJson.anketa as Record<string, unknown>).parsedStopFactors = parsed.stopFactors
        }
        if (parsed.desiredParams.length > 0) {
          (descriptionJson.anketa as Record<string, unknown>).parsedDesiredParams = parsed.desiredParams
        }
      }

      // Save AI text for anketa-tab to auto-parse after navigation
      if (aiText.trim()) {
        try { sessionStorage.setItem("vacancy_ai_text", aiText.trim()) } catch {}
      }

      const res = await fetch("/api/modules/hr/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newVacancyTitle.trim(),
          ...(Object.keys(descriptionJson).length > 0 ? { description_json: descriptionJson } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json() as { id: string }
      setCreateDialogOpen(false)
      resetCreateDialog()
      router.push(`/hr/vacancies/${data.id}`)
    } catch {
      toast.error("Не удалось создать вакансию")
    } finally {
      setCreating(false)
    }
  }, [newVacancyTitle, uploadedFile, importedText, importUrl, aiText, router, resetCreateDialog])

  const hrManagerTrashEnabled = typeof window !== "undefined" && localStorage.getItem(TRASH_ACCESS_KEY) === "true"
  const canSeeTrash = TRASH_ROLES_ALWAYS.includes(role) || (role === TRASH_ROLE_OPTIONAL && hrManagerTrashEnabled)

  const fetchTrash = useCallback(async () => {
    setTrashLoading(true)
    try {
      const res = await fetch("/api/modules/hr/vacancies?deleted=true&limit=50")
      if (!res.ok) throw new Error()
      const data = await res.json() as { vacancies: ApiVacancy[] }
      setTrashItems(data.vacancies ?? [])
    } catch { setTrashItems([]) }
    finally { setTrashLoading(false) }
  }, [])

  const handleRestore = useCallback(async (v: ApiVacancy) => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, { method: "PATCH" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия восстановлена")
      fetchTrash()
      refetch()
    } catch { toast.error("Не удалось восстановить") }
  }, [fetchTrash, refetch])

  const handlePermanentDelete = useCallback(async () => {
    if (!permanentDeleteTarget) return
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${permanentDeleteTarget.id}/permanent`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия удалена навсегда")
      fetchTrash()
    } catch { toast.error("Не удалось удалить") }
    finally { setPermanentDeleteTarget(null) }
  }, [permanentDeleteTarget, fetchTrash])

  // Open trash panel
  const openTrash = useCallback(() => {
    setTrashOpen(true)
    fetchTrash()
  }, [fetchTrash])

  // Fetch trash count on mount
  useEffect(() => {
    if (canSeeTrash) fetchTrash()
  }, [canSeeTrash, fetchTrash])

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: TeamMember[] | { data: TeamMember[] }) => {
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setTeamMembers(list)
      })
      .catch(() => {})
  }, [])

  const toggleColSort = (column: string) => {
    setColSort((prev) => {
      if (prev?.column !== column) return { column, dir: "asc" }
      if (prev.dir === "asc") return { column, dir: "desc" }
      return null
    })
  }

  // ── Actions ──────────────────────────────────────────────────
  const handleDuplicate = useCallback(async (v: ApiVacancy) => {
    try {
      const res = await fetch("/api/modules/hr/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${v.title} (копия)`,
          city: v.city,
          format: v.format,
          employment: v.employment,
          category: v.category,
          salary_min: v.salaryMin,
          salary_max: v.salaryMax,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия дублирована")
      refetch()
    } catch {
      toast.error("Не удалось дублировать вакансию")
    }
  }, [refetch])

  const handleArchive = useCallback(async (v: ApiVacancy) => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия перемещена в архив")
      refetch()
    } catch {
      toast.error("Не удалось архивировать вакансию")
    }
  }, [refetch])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия перемещена в корзину")
      setSelected((prev) => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      refetch()
    } catch {
      toast.error("Не удалось удалить вакансию")
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, refetch])

  const actions = { onDuplicate: handleDuplicate, onArchive: handleArchive, onDelete: setDeleteTarget }

  // ── Filter & sort ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = vacancies

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((v) => v.title.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") {
      result = result.filter((v) => v.status === statusFilter)
    }
    if (hrFilter !== "all") {
      result = result.filter((v) => v.createdBy === hrFilter)
    }

    result = [...result].sort((a, b) => {
      if (!colSort) return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      const mul = colSort.dir === "asc" ? 1 : -1
      if (colSort.column === "status") return mul * ((STATUS_ORDER[a.status ?? "draft"] ?? 9) - (STATUS_ORDER[b.status ?? "draft"] ?? 9))
      if (colSort.column === "date") return mul * (new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
      if (colSort.column === "hr") return mul * getHrName(a.createdBy, teamMembers).localeCompare(getHrName(b.createdBy, teamMembers), "ru")
      return 0
    })

    return result
  }, [vacancies, search, statusFilter, hrFilter, colSort, teamMembers])

  const allSelected = filtered.length > 0 && filtered.every((v) => selected.has(v.id))
  const toggleOne = (id: string) => { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleAll = () => { allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map((v) => v.id))) }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Вакансии</h1>
                {!loading && <p className="text-sm text-muted-foreground mt-0.5">{total} вакансий</p>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                  {VIEW_MODES.map((m) => (
                    <button key={m.value} type="button" onClick={() => setView(m.value)} title={m.label}
                      className={cn("flex items-center justify-center size-8 rounded-md transition-colors",
                        view === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}>
                      <m.icon className="size-4" />
                    </button>
                  ))}
                </div>
                {canSeeTrash && (
                  <button type="button" onClick={openTrash} title="Корзина"
                    className="relative flex items-center justify-center size-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors">
                    <Trash2 className="size-4" />
                    {trashItems.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center size-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                        {trashItems.length}
                      </span>
                    )}
                  </button>
                )}
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="size-4 mr-1.5" />Создать вакансию
                </Button>
              </div>
            </div>

            {/* Toolbar */}
            {!loading && vacancies.length > 0 && (<>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 basis-1/2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Поиск по названию..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className={cn("pl-9", FILTER_INPUT)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className={cn("flex-1 basis-1/4", FILTER_INPUT)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={hrFilter} onValueChange={setHrFilter}>
                  <SelectTrigger className={cn("flex-1 basis-1/4", FILTER_INPUT)}><SelectValue placeholder="Все HR" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все HR</SelectItem>
                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selected.size > 0 && <div className="text-xs text-muted-foreground mb-2">Выбрано: {selected.size}</div>}
            </>)}

            {/* Loading */}
            {loading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )}

            {/* Empty */}
            {!loading && vacancies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Briefcase className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Вакансий пока нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Создайте первую вакансию чтобы начать найм</p>
                <Button onClick={() => setCreateDialogOpen(true)}><Plus className="size-4 mr-1.5" />Создать вакансию</Button>
              </div>
            )}

            {/* No results */}
            {!loading && vacancies.length > 0 && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">Ничего не найдено</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Попробуйте изменить фильтры</p>
              </div>
            )}

            {/* List */}
            {!loading && filtered.length > 0 && view === "list" && (
              <div className="space-y-2">
                {filtered.map((v) => <VacancyListItem key={v.id} v={v} selected={selected.has(v.id)} onToggle={() => toggleOne(v.id)} team={teamMembers} actions={actions} />)}
              </div>
            )}

            {/* Tiles */}
            {!loading && filtered.length > 0 && view === "tiles" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((v) => <VacancyTile key={v.id} v={v} selected={selected.has(v.id)} onToggle={() => toggleOne(v.id)} team={teamMembers} actions={actions} />)}
              </div>
            )}

            {/* Table */}
            {!loading && filtered.length > 0 && view === "table" && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="pl-5 pr-2 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Вакансия</th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Город</th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Зарплата</th>
                      <th className="px-4 py-3"><SortableHeader label="Статус" column="status" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Создана" column="date" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Менеджер" column="hr" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="pl-2 pr-5 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v, i) => (
                      <tr key={v.id}
                        className={cn("transition-colors cursor-pointer hover:bg-accent/40",
                          selected.has(v.id) && "bg-primary/[0.04]",
                          i < filtered.length - 1 && "border-b border-border/60",
                        )}
                        onClick={() => router.push(`/hr/vacancies/${v.id}`)}>
                        <td className="pl-5 pr-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleOne(v.id)} />
                        </td>
                        <td className="px-4 py-3.5 font-medium text-sm text-foreground">{v.title}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{v.city ?? "—"}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatSalary(v.salaryMin, v.salaryMax) ?? "—"}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(v.createdAt)}</td>
                        <td className="px-4 py-3.5"><HrAvatar name={getHrName(v.createdBy, teamMembers)} /></td>
                        <td className="pl-2 pr-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <RowActions v={v} {...actions} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      {/* Soft delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Переместить в корзину?</AlertDialogTitle>
            <AlertDialogDescription>
              Вакансия «{deleteTarget?.title}» будет перемещена в корзину. Вы сможете восстановить её позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              В корзину
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete confirmation */}
      <AlertDialog open={!!permanentDeleteTarget} onOpenChange={(open) => !open && setPermanentDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              Вакансия «{permanentDeleteTarget?.title}» будет удалена безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trash panel */}
      <Sheet open={trashOpen} onOpenChange={setTrashOpen}>
        <SheetContent className="w-[420px] sm:w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="size-5" />
              Корзина
              {trashItems.length > 0 && (
                <Badge variant="secondary" className="text-xs">{trashItems.length}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto mt-4">
            {trashLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )}
            {!trashLoading && trashItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Trash2 className="size-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Корзина пуста</p>
              </div>
            )}
            {!trashLoading && trashItems.length > 0 && (
              <div className="space-y-2">
                {trashItems.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.city ?? "—"}{v.deletedAt ? ` · Удалена ${formatDate(v.deletedAt)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 h-8 gap-1.5 text-xs" onClick={() => handleRestore(v)}>
                      <RotateCcw className="size-3.5" />Восстановить
                    </Button>
                    <Button size="sm" variant="ghost" className="shrink-0 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setPermanentDeleteTarget(v)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Create vacancy dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetCreateDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать вакансию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title input — required */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Название вакансии</Label>
              <Input
                value={newVacancyTitle}
                onChange={(e) => setNewVacancyTitle(e.target.value)}
                placeholder="Менеджер по продажам"
                className="h-10 border border-input"
                onKeyDown={(e) => { if (e.key === "Enter" && newVacancyTitle.trim()) handleCreateVacancy() }}
                autoFocus
              />
            </div>

            {/* Upload */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Upload className="size-4 text-primary" />
                <span className="font-medium">Загрузить описание</span>
                <span className="text-xs text-muted-foreground">(необязательно)</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc,.pdf,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = "" }}
              />
              {uploadedFile ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">{uploadedFile.name}</span>
                  <button type="button" onClick={() => setUploadedFile(null)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={cn(
                    "w-full h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors",
                    dragOver
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary",
                    uploading && "pointer-events-none opacity-60",
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const f = e.dataTransfer.files[0]
                    if (f) handleFileUpload(f)
                  }}
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <>
                      <FileText className="size-5" />
                      <span className="text-xs">Перетащите файл или нажмите • DOCX, PDF, TXT</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* AI text input */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-primary" />
                AI-заполнение
                <span className="text-xs text-muted-foreground font-normal">(необязательно)</span>
              </div>
              <Textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="Вставьте описание вакансии или должностные обязанности — AI заполнит анкету автоматически..."
                className="h-32 bg-[var(--input-bg)] border border-input resize-none text-sm"
              />
            </div>

            {/* Create button */}
            <Button className="w-full h-10" onClick={handleCreateVacancy} disabled={creating || !newVacancyTitle.trim()}>
              {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
              Создать вакансию
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
