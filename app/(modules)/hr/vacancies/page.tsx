"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
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
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useVacancies, type ApiVacancy } from "@/hooks/use-vacancies"
import { VacancyStatusBadge, getVacancyStatusLabel } from "@/components/vacancies/vacancy-status-badge"
import { VacancyActionsMenuItems } from "@/components/vacancies/vacancy-actions-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataSelectHeadCell } from "@/components/ui/data-table"
import { PermanentDeleteDialog } from "@/components/vacancies/permanent-delete-dialog"
import { getVacancyState, getTrashDaysRemaining, formatTrashCountdown } from "@/lib/vacancies/lifecycle"
import {
  Plus, Briefcase, MapPin, List, LayoutGrid, Table2, Calendar, Banknote,
  Search, MoreHorizontal, Pencil, Copy, Archive, Trash2,
  Loader2, ExternalLink, Pause, RotateCcw, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  active: 0, published: 0, draft: 1, paused: 2, closed_success: 3, closed_cancelled: 4, archived: 5,
}

const STATUS_FILTER_OPTIONS = [
  { value: "all",              label: "Все статусы" },
  { value: "draft",            label: getVacancyStatusLabel("draft") },
  { value: "active",           label: getVacancyStatusLabel("active") },
  { value: "published",        label: getVacancyStatusLabel("published") },
  { value: "paused",           label: getVacancyStatusLabel("paused") },
  { value: "closed_success",   label: getVacancyStatusLabel("closed_success") },
  { value: "closed_cancelled", label: getVacancyStatusLabel("closed_cancelled") },
]

type ViewMode = "list" | "tiles" | "table"
type ColumnSort = { column: string; dir: "asc" | "desc" } | null

const VIEW_MODES: { value: ViewMode; icon: typeof List; label: string }[] = [
  { value: "list",  icon: List,       label: "Список" },
  { value: "tiles", icon: LayoutGrid, label: "Плитки" },
  { value: "table", icon: Table2,     label: "Таблица" },
]

const FILTER_INPUT = "h-10 text-sm border border-gray-300 rounded-lg"

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
  return <VacancyStatusBadge status={status} />
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


// ─── Row actions ─────────────────────────────────────────────────────────────

// Контекстное меню для строки таблицы (правый клик)
function RowContextMenu({
  v, children, onDuplicate, onArchive, onDelete,
}: {
  v: ApiVacancy
  children: React.ReactNode
  onDuplicate: (v: ApiVacancy) => void
  onArchive: (v: ApiVacancy) => void
  onDelete: (v: ApiVacancy) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => window.open(`/hr/vacancies/${v.id}?tab=candidates`, "_blank")}>
          <ExternalLink className="size-4 mr-2" />Открыть в новой вкладке
        </ContextMenuItem>
        <ContextMenuItem onClick={() => window.location.href = `/hr/vacancies/${v.id}/edit`}>
          <Pencil className="size-4 mr-2" />Редактировать
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDuplicate(v)}>
          <Copy className="size-4 mr-2" />Дублировать
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onArchive(v)}>
          <Archive className="size-4 mr-2" />В архив
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(v)}
        >
          <Trash2 className="size-4 mr-2" />В корзину
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Полный набор действий над вакансией из строки списка. Каждое принимает
// вакансию — RowActions связывает их с конкретной строкой.
interface RowActionHandlers {
  onDuplicate:       (v: ApiVacancy) => void
  onExport:          (v: ApiVacancy) => void
  onPause:           (v: ApiVacancy) => void
  onResume:          (v: ApiVacancy) => void
  onArchive:         (v: ApiVacancy) => void
  onRestore:         (v: ApiVacancy) => void
  onTrash:           (v: ApiVacancy) => void
  onPermanentDelete: (v: ApiVacancy) => void
}

// Бэйдж обратного отсчёта до авто-удаления — показывается в строках корзины.
function TrashCountdownBadge({ deletedAt, retentionDays }: { deletedAt: string | null; retentionDays: number }) {
  if (!deletedAt) return null
  const days = getTrashDaysRemaining(deletedAt, retentionDays)
  return (
    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
      <Trash2 className="size-3.5" />{formatTrashCountdown(days)}
    </span>
  )
}

// «...» меню строки списка — те же 8 пунктов, что и «Действия» в шапке
// вакансии (общий компонент VacancyActionsMenuItems) + «Открыть»/«Редактировать».
function RowActions({ v, handlers }: { v: ApiVacancy; handlers: RowActionHandlers }) {
  const lifecycle = getVacancyState({ status: v.status, deletedAt: v.deletedAt })
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
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(`/hr/vacancies/${v.id}?tab=candidates`, "_blank") }}>
          <ExternalLink className="size-4 mr-2" />Открыть в новой вкладке
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.location.href = `/hr/vacancies/${v.id}/edit` }}>
          <Pencil className="size-4 mr-2" />Редактировать
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <VacancyActionsMenuItems
          lifecycle={lifecycle}
          handlers={{
            onDuplicate:       () => handlers.onDuplicate(v),
            onExport:          () => handlers.onExport(v),
            onPause:           () => handlers.onPause(v),
            onResume:          () => handlers.onResume(v),
            onArchive:         () => handlers.onArchive(v),
            onRestore:         () => handlers.onRestore(v),
            onTrash:           () => handlers.onTrash(v),
            onPermanentDelete: () => handlers.onPermanentDelete(v),
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── List view ───────────────────────────────────────────────────────────────

function VacancyListItem({ v, selected, onToggle, team, actions, trashRetentionDays }: {
  v: ApiVacancy; selected: boolean; onToggle: () => void; team: TeamMember[]
  actions: RowActionHandlers; trashRetentionDays: number
}) {
  const salary = formatSalary(v.salaryMin, v.salaryMax)
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card transition-colors group">
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
            <TrashCountdownBadge deletedAt={v.deletedAt} retentionDays={trashRetentionDays} />
          </div>
        </div>
        <HrAvatar name={getHrName(v.createdBy, team)} />
        <StatusBadge status={v.status} />
      </Link>
      <RowActions v={v} handlers={actions} />
    </div>
  )
}

// ─── Tiles view ──────────────────────────────────────────────────────────────

function VacancyTile({ v, selected, onToggle, team, actions, trashRetentionDays }: {
  v: ApiVacancy; selected: boolean; onToggle: () => void; team: TeamMember[]
  actions: RowActionHandlers; trashRetentionDays: number
}) {
  const salary = formatSalary(v.salaryMin, v.salaryMax)
  return (
    <div className="flex flex-col p-4 rounded-lg border border-border bg-card transition-colors group relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggle} className="shrink-0" />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Briefcase className="size-4" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={v.status} />
          <RowActions v={v} handlers={actions} />
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
        {v.deletedAt
          ? <span className="text-xs"><TrashCountdownBadge deletedAt={v.deletedAt} retentionDays={trashRetentionDays} /></span>
          : <span className="text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>}
      </div>
    </div>
  )
}

// ─── VacanciesView ───────────────────────────────────────────────────────────

// Именованный export намеренно убран: Next.js App Router не допускает
// именованных экспортов в page.tsx. Для встраивания в другой таб —
// перенести этот компонент в components/vacancies/vacancies-view.tsx
// и экспортировать оттуда.
export function VacanciesView({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const { role } = useAuth()
  // Таб «Активные» (active+paused) / «Архив» (закрытые). Скоуп уходит на
  // сервер — список и счётчики считаются по БД, не по загруженной странице.
  const [scope, setScope] = useState<"active" | "archive" | "trash">("active")
  const { vacancies, total, counts, trashRetentionDays, loading, refetch } = useVacancies(1, 100, scope)
  // Корзина по умолчанию видна только директору/главному HR. HR-менеджеру —
  // только если в «Настройки → Роли и доступ» включён доступ к корзине
  // (companies.hiringDefaultsJson.rolePermissions.hrManagerTrashAccess).
  const [hrManagerTrashAccess, setHrManagerTrashAccess] = useState(false)
  useEffect(() => {
    if (role !== "hr_manager") return
    let cancelled = false
    fetch("/api/modules/hr/company/hiring-defaults")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data) setHrManagerTrashAccess(Boolean(data.hiringDefaults?.rolePermissions?.hrManagerTrashAccess))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [role])
  const canSeeTrash = role !== "hr_manager" || hrManagerTrashAccess
  // Если HR-менеджер был на табе «Корзина», а доступ выключен — вернуть на «Активные».
  useEffect(() => {
    if (!canSeeTrash && scope === "trash") { setScope("active"); setSelected(new Set()) }
  }, [canSeeTrash, scope])
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table"
    const stored = window.localStorage.getItem("vacancies-view")
    return stored === "list" || stored === "tiles" || stored === "table" ? stored : "table"
  })
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("vacancies-view", view)
  }, [view])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [hrFilter, setHrFilter] = useState("all")
  const [colSort, setColSort] = useState<ColumnSort>({ column: "date", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [deleteTarget, setDeleteTarget] = useState<ApiVacancy | null>(null)
  // Корзина теперь отдельный таб (scope="trash"). Удаление навсегда — через
  // общий диалог PermanentDeleteDialog (ввод названия для подтверждения).
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ApiVacancy | null>(null)
  // Create vacancy — быстрое создание пустой анкеты
  const [creating, setCreating] = useState(false)

  const handleQuickCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch("/api/modules/hr/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Новая вакансия" }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { id: string }
      router.push(`/hr/vacancies/${data.id}?tab=anketa`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
      toast.error(`Не удалось создать вакансию: ${msg}`)
      setCreating(false)
    }
  }, [creating, router])

  // ── Действия строки (тот же набор, что в меню «Действия» вакансии) ──
  const handleExport = useCallback((v: ApiVacancy) => {
    const a = document.createElement("a")
    a.href = `/api/modules/hr/vacancies/${v.id}/export-candidates`
    document.body.appendChild(a); a.click(); a.remove()
    toast.success("Экспорт начался")
  }, [])

  const updateRowStatus = useCallback(async (v: ApiVacancy, status: string, msg: string) => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(msg); refetch()
    } catch { toast.error("Не удалось обновить вакансию") }
  }, [refetch])

  const handlePause  = useCallback((v: ApiVacancy) => updateRowStatus(v, "paused", "Вакансия приостановлена"), [updateRowStatus])
  const handleResume = useCallback((v: ApiVacancy) => updateRowStatus(v, "active", "Вакансия возобновлена"), [updateRowStatus])

  // Восстановить: из корзины → PATCH (очистка deleted_at); из архива → status active.
  const handleRestore = useCallback(async (v: ApiVacancy) => {
    try {
      if (v.deletedAt) {
        const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
        })
        if (!res.ok) throw new Error()
        toast.success("Вакансия восстановлена из корзины")
      } else {
        const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }),
        })
        if (!res.ok) throw new Error()
        toast.success("Вакансия восстановлена из архива")
      }
      refetch()
    } catch { toast.error("Не удалось восстановить вакансию") }
  }, [refetch])

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
      // Тот же эндпоинт, что и на странице вакансии (page.tsx:1160) — копирует
      // ВСЕ настройки (AI-бот, воронка, стоп-факторы, описание, анкета, демо).
      // Раньше список слал POST /api/modules/hr/vacancies лишь с 6 базовыми
      // полями → создавалась почти пустая копия (баг B1, 01.06.2026).
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}/duplicate`, { method: "POST" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия дублирована")
      refetch()
    } catch {
      toast.error("Не удалось дублировать вакансию")
    }
  }, [refetch])

  const handleArchive = useCallback(async (v: ApiVacancy) => {
    try {
      // Принцип: в архив уходит ОСТАНОВЛЕННАЯ вакансия. Если активна — сначала
      // останавливаем, затем архивируем (без подтверждений, одним действием).
      if (v.status === "active" || v.status === "published") {
        await fetch(`/api/modules/hr/vacancies/${v.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "paused" }),
        })
      }
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия перенесена в архив")
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

  const actions: RowActionHandlers = {
    onDuplicate:       handleDuplicate,
    onExport:          handleExport,
    onPause:           handlePause,
    onResume:          handleResume,
    onArchive:         handleArchive,
    onRestore:         handleRestore,
    onTrash:           setDeleteTarget,           // открывает подтверждение «в корзину»
    onPermanentDelete: setPermanentDeleteTarget,  // открывает диалог «удалить навсегда»
  }

  // ── Массовые действия над выделенными ────────────────────────
  // Прогоняем те же одиночные операции по списку выбранных id. Набор кнопок
  // зависит от вкладки (scope): активные → архив/корзина/пауза; архив →
  // восстановить/корзина; корзина → восстановить/удалить навсегда.
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false)
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false)

  // Выполнить операцию по каждому выбранному id последовательно (anti-rate-limit),
  // показать единый тост, снять выделение и обновить список.
  const runBulk = useCallback(async (
    ids: string[],
    op: (id: string) => Promise<Response>,
    okMsg: (n: number) => string,
  ) => {
    if (ids.length === 0) return
    setBulkBusy(true)
    let done = 0
    for (const id of ids) {
      try { const res = await op(id); if (res.ok) done++ } catch { /* счётчик ниже */ }
    }
    setBulkBusy(false)
    setSelected(new Set())
    if (done === ids.length) toast.success(okMsg(done))
    else if (done > 0) toast.warning(`${okMsg(done)} (не удалось: ${ids.length - done})`)
    else toast.error("Не удалось выполнить действие")
    refetch()
  }, [refetch])

  const bulkArchive = useCallback(() => runBulk(
    [...selected],
    (id) => fetch(`/api/modules/hr/vacancies/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }),
    }),
    (n) => `В архив перемещено: ${n}`,
  ), [runBulk, selected])

  const bulkPause = useCallback(() => runBulk(
    [...selected],
    (id) => fetch(`/api/modules/hr/vacancies/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paused" }),
    }),
    (n) => `Приостановлено: ${n}`,
  ), [runBulk, selected])

  const bulkTrash = useCallback(() => runBulk(
    [...selected],
    (id) => fetch(`/api/modules/hr/vacancies/${id}`, { method: "DELETE" }),
    (n) => `В корзину перемещено: ${n}`,
  ), [runBulk, selected])

  // Восстановление: из корзины — PATCH (очистка deleted_at), из архива — status active.
  const bulkRestore = useCallback(() => runBulk(
    [...selected],
    (id) => scope === "trash"
      ? fetch(`/api/modules/hr/vacancies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })
      : fetch(`/api/modules/hr/vacancies/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }) }),
    (n) => `Восстановлено: ${n}`,
  ), [runBulk, selected, scope])

  // Удалить навсегда — один запрос на пачку через bulk-permanent.
  const bulkPurge = useCallback(async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const res = await fetch("/api/modules/hr/vacancies/trash/bulk-permanent", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Удалено навсегда: ${ids.length}`)
      setSelected(new Set())
      refetch()
    } catch { toast.error("Не удалось удалить навсегда") }
    finally { setBulkBusy(false); setBulkPurgeOpen(false) }
  }, [selected, refetch])

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
    <>
      <div className="flex-1 overflow-auto bg-background min-w-0">
        <div className="pt-6 pb-36 md:pb-6 px-4 sm:px-14">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            {!embedded && (
              <div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold text-foreground">Вакансии</h1>
                </div>
                {!loading && <p className="text-sm text-muted-foreground mt-0.5">{total} вакансий</p>}
              </div>
            )}
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
                <Button onClick={handleQuickCreate} disabled={creating} title="Создать вакансию">
                  {creating ? <Loader2 className="size-4 sm:mr-1.5 animate-spin" /> : <Plus className="size-4 sm:mr-1.5" />}
                  <span className="hidden sm:inline">Создать вакансию</span>
                </Button>
              </div>
            </div>

            {/* Табы: Активные (active+paused) / Архив (закрытые) / Корзина
                (deleted_at, авто-удаление через trash_retention_days). Счётчики — по БД. */}
            <div className="flex items-center gap-1 mb-4 border-b border-border">
              {([
                { key: "active",  label: "Активные", n: counts.active },
                { key: "archive", label: "Архив",    n: counts.archived },
                ...(canSeeTrash ? [{ key: "trash" as const, label: "Корзина", n: counts.trashed }] : []),
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setScope(t.key); setSelected(new Set()) }}
                  className={cn(
                    "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                    scope === t.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label} <span className="text-muted-foreground">({t.n})</span>
                </button>
              ))}
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
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border bg-muted/40 px-3 py-2">
                  <span className="text-xs font-medium tabular-nums">Выбрано: {selected.size}</span>
                  <div className="h-4 w-px bg-border mx-1" />
                  {bulkBusy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

                  {/* Активные/Приостановленные → пауза / архив / корзина */}
                  {scope === "active" && (<>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={bulkBusy} onClick={bulkPause}>
                      <Pause className="size-3.5" />Остановить
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={bulkBusy} onClick={bulkArchive}>
                      <Archive className="size-3.5" />В архив
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" disabled={bulkBusy} onClick={() => setBulkTrashOpen(true)}>
                      <Trash2 className="size-3.5" />В корзину
                    </Button>
                  </>)}

                  {/* Архив → восстановить / корзина */}
                  {scope === "archive" && (<>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={bulkBusy} onClick={bulkRestore}>
                      <RotateCcw className="size-3.5" />Восстановить
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" disabled={bulkBusy} onClick={() => setBulkTrashOpen(true)}>
                      <Trash2 className="size-3.5" />В корзину
                    </Button>
                  </>)}

                  {/* Корзина → восстановить / удалить навсегда */}
                  {scope === "trash" && (<>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={bulkBusy} onClick={bulkRestore}>
                      <RotateCcw className="size-3.5" />Восстановить
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" disabled={bulkBusy} onClick={() => setBulkPurgeOpen(true)}>
                      <Trash2 className="size-3.5" />Удалить навсегда
                    </Button>
                  </>)}

                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs ml-auto" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                    <X className="size-3.5" />Снять выделение
                  </Button>
                </div>
              )}
            </>)}

            {/* Loading */}
            {loading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )}

            {/* Empty — нет вакансий вообще (ни активных, ни в архиве, ни в корзине) */}
            {!loading && vacancies.length === 0 && counts.active + counts.archived + counts.trashed === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Briefcase className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Вакансий пока нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Создайте первую вакансию чтобы начать найм</p>
                <Button onClick={handleQuickCreate} disabled={creating}>
                  {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
                  Создать вакансию
                </Button>
              </div>
            )}

            {/* Empty — текущий таб пуст, но вакансии есть в другом */}
            {!loading && vacancies.length === 0 && counts.active + counts.archived + counts.trashed > 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">
                  {scope === "archive" ? "В архиве пусто" : scope === "trash" ? "Корзина пуста" : "Нет активных вакансий"}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {scope === "archive"
                    ? "Закрытые вакансии попадают сюда автоматически"
                    : scope === "trash"
                    ? `Удалённые вакансии хранятся здесь и удаляются навсегда через ${trashRetentionDays} дн.`
                    : "Загляните в архив или создайте новую вакансию"}
                </p>
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
                {filtered.map((v) => <VacancyListItem key={v.id} v={v} selected={selected.has(v.id)} onToggle={() => toggleOne(v.id)} team={teamMembers} actions={actions} trashRetentionDays={trashRetentionDays} />)}
              </div>
            )}

            {/* Tiles */}
            {!loading && filtered.length > 0 && view === "tiles" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((v) => <VacancyTile key={v.id} v={v} selected={selected.has(v.id)} onToggle={() => toggleOne(v.id)} team={teamMembers} actions={actions} trashRetentionDays={trashRetentionDays} />)}
              </div>
            )}

            {/* Table */}
            {!loading && filtered.length > 0 && view === "table" && (
              <TableCard>
                <DataTable className="text-left">
                  <DataHead>
                    <DataSelectHeadCell checked={allSelected} onCheckedChange={toggleAll} />
                    <DataHeadCell style={{ minWidth: 450 }}>Вакансия</DataHeadCell>
                    <DataHeadCell>Город</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "status" ? colSort.dir : null} onSort={() => toggleColSort("status")}>Статус</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "date" ? colSort.dir : null} onSort={() => toggleColSort("date")}>Создана</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "hr" ? colSort.dir : null} onSort={() => toggleColSort("hr")}>Менеджер</DataHeadCell>
                    <DataHeadCell width="40px" className="pl-2 pr-5"> </DataHeadCell>
                  </DataHead>
                  <tbody>
                    {filtered.map((v, i) => (
                      <RowContextMenu key={v.id} v={v} onDuplicate={handleDuplicate} onArchive={handleArchive} onDelete={setDeleteTarget}>
                      <tr
                        className={cn("transition-colors cursor-pointer hover:bg-accent/40",
                          selected.has(v.id) && "bg-primary/[0.04]",
                          i < filtered.length - 1 && "border-b border-border/60",
                        )}
                        onClick={() => router.push(`/hr/vacancies/${v.id}`)}>
                        <td className="pl-5 pr-2 py-3.5 w-10" style={{ verticalAlign: "middle" }} onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleOne(v.id)} style={{ display: "block", width: "1rem", height: "1rem", minHeight: "1rem", maxHeight: "1rem" }} />
                        </td>
                        <td className="px-4 py-3.5 font-medium text-sm text-foreground" style={{ minWidth: 450 }}>{v.title}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{v.city ?? "—"}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                          {v.deletedAt
                            ? <TrashCountdownBadge deletedAt={v.deletedAt} retentionDays={trashRetentionDays} />
                            : formatDate(v.createdAt)}
                        </td>
                        <td className="px-4 py-3.5"><HrAvatar name={getHrName(v.createdBy, teamMembers)} /></td>
                        <td className="pl-2 pr-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <RowActions v={v} handlers={actions} />
                        </td>
                      </tr>
                      </RowContextMenu>
                    ))}
                  </tbody>
                </DataTable>
              </TableCard>
            )}
          </div>
        </div>

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

      {/* Массовое «в корзину» — подтверждение. */}
      <AlertDialog open={bulkTrashOpen} onOpenChange={setBulkTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Переместить в корзину?</AlertDialogTitle>
            <AlertDialogDescription>
              Выбранные вакансии ({selected.size}) будут перемещены в корзину. Вы сможете восстановить их позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setBulkTrashOpen(false); bulkTrash() }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              В корзину ({selected.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Массовое «удалить навсегда» — подтверждение (необратимо). */}
      <AlertDialog open={bulkPurgeOpen} onOpenChange={setBulkPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              Выбранные вакансии ({selected.size}) и все связанные с ними данные (кандидаты, демо, отклики) будут удалены
              безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={bulkPurge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить навсегда ({selected.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Удалить навсегда — общий диалог с подтверждением вводом названия. */}
      {permanentDeleteTarget && (
        <PermanentDeleteDialog
          open={!!permanentDeleteTarget}
          onOpenChange={(o) => { if (!o) setPermanentDeleteTarget(null) }}
          vacancyId={permanentDeleteTarget.id}
          vacancyTitle={permanentDeleteTarget.title}
          onDeleted={() => { setPermanentDeleteTarget(null); refetch() }}
        />
      )}

    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function VacanciesPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <VacanciesView />
      </SidebarInset>
    </SidebarProvider>
  )
}
