"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Search, Users, MoreHorizontal, UserPlus, Archive, XCircle, Loader2, Star, Eye, ChevronDown } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell, DataSelectHeadCell, DataSelectCell } from "@/components/ui/data-table"
import Link from "next/link"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getStageLabel, getStageColorClasses } from "@/lib/stages"
import { StageMessageControl } from "@/components/candidates/stage-message-control"

// ─── Types & constants ───────────────────────────────────────────────────────

interface Candidate {
  id: string
  name: string
  vacancyId: string
  vacancyTitle: string
  stage: string
  createdAt: string
  source: string | null
  city: string | null
  demoTotalBlocks: number
  demoCompletedBlocks: number
  progressPercent: number | null
  isActive: boolean
  isFavorite: boolean
}

// Лейблы и цвета статусов — единый источник правды в lib/stages.ts
// (getStageLabel / getStageColorClasses), локальные карты убраны (баг A1).

const STATUS_ORDER: Record<string, number> = {
  new: 0, demo: 1, scheduled: 2, interviewed: 3, interview: 3, decision: 4, offer: 5, hired: 6, rejected: 7, talent_pool: 8,
}

const SOURCE_LABELS: Record<string, string> = {
  hh: "hh.ru", avito: "Авито", telegram: "Telegram", site: "Сайт",
  referral: "Реферал", manual: "Вручную", direct: "Прямой",
}

const STATUS_FILTER = [
  { value: "all", label: "Все статусы" },
  { value: "new", label: "Новый" },
  { value: "demo", label: "На демо" },
  { value: "scheduled", label: "Интервью назн." },
  { value: "interviewed", label: "Интервью пройд." },
  { value: "hired", label: "Принят" },
  { value: "rejected", label: "Отказ" },
]

const SOURCE_FILTER = [
  { value: "all", label: "Все источники" },
  { value: "hh", label: "hh.ru" },
  { value: "referral", label: "Реферал" },
  { value: "manual", label: "Вручную" },
  { value: "site", label: "Сайт" },
]

const FILTER_INPUT = "h-10 text-sm border border-input rounded-md"

const AVATAR_COLORS = ["#8b5cf6", "#3b82f6", "#ef4444", "#f59e0b", "#22c55e", "#0ea5e9", "#6b7280", "#ec4899"]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function progressTextClass(percent: number | null, isActive: boolean): string {
  if (percent === null || percent === 0) return "text-muted-foreground"
  if (percent === 100) return "text-emerald-500"
  if (percent >= 71) return "text-blue-500"
  if (percent >= 31) return "text-amber-600"
  return cn("text-red-500", isActive && "animate-pulse")
}

type ColumnSort = { column: string; dir: "asc" | "desc" } | null

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState("all")
  const [vacancyFilter, setVacancyFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [colSort, setColSort] = useState<ColumnSort>({ column: "date", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const PAGE_SIZE = 50

  // Серверные фильтры: меняются → сбрасываем на стр.1 и перегружаем.
  // B6: ВСЕ фильтры серверные (включая «Избранные») — иначе на пагинации
  // клиентский фильтр видел только загруженную страницу.
  const filterParams = useMemo(() => {
    const ps = new URLSearchParams()
    if (statusFilter !== "all") ps.set("stage", statusFilter)
    if (sourceFilter !== "all") ps.set("source", sourceFilter)
    if (debouncedSearch.trim()) ps.set("search", debouncedSearch.trim())
    if (vacancyFilter !== "all") ps.set("vacancyTitle", vacancyFilter)
    if (favoriteOnly) ps.set("favorite", "true")
    return ps
  }, [statusFilter, sourceFilter, debouncedSearch, vacancyFilter, favoriteOnly])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams(filterParams)
    qs.set("page", "1")
    qs.set("pageSize", String(PAGE_SIZE))
    fetch(`/api/modules/hr/candidates?${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { items?: Candidate[]; total?: number; hasMore?: boolean }) => {
        if (cancelled) return
        setCandidates(Array.isArray(data.items) ? data.items : [])
        setTotal(data.total ?? 0)
        setHasMore(!!data.hasMore)
        setPage(1)
      })
      .catch(() => {
        if (!cancelled) {
          setCandidates([])
          setTotal(0)
          setHasMore(false)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filterParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const qs = new URLSearchParams(filterParams)
      qs.set("page", String(nextPage))
      qs.set("pageSize", String(PAGE_SIZE))
      const res = await fetch(`/api/modules/hr/candidates?${qs}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { items?: Candidate[]; total?: number; hasMore?: boolean }
      const items = Array.isArray(data.items) ? data.items : []
      setCandidates(prev => [...prev, ...items])
      setTotal(data.total ?? total)
      setHasMore(!!data.hasMore)
      setPage(nextPage)
    } catch {
      toast.error("Не удалось загрузить следующую страницу")
    } finally {
      setLoadingMore(false)
    }
  }

  const [bulkLoading, setBulkLoading] = useState(false)

  // Диалог смены стадии (одиночный и bulk)
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [pendingStage, setPendingStage]   = useState<string | null>(null)
  // null = bulk, string = одиночный candidateId
  const [pendingCandidateId, setPendingCandidateId]   = useState<string | null>(null)
  const [pendingCandidateName, setPendingCandidateName] = useState<string | null>(null)
  // vacancyId нужен для предпросмотра (берём из кандидата при одиночном, null при bulk)
  const [pendingVacancyId, setPendingVacancyId] = useState<string | null>(null)
  const [sendMessage, setSendMessage]   = useState(true)
  const [stageMessageText, setStageMessageText] = useState("")
  const [stageDialogLoading, setStageDialogLoading] = useState(false)

  // Открыть диалог для одиночного действия
  const openStageDialog = (candidateId: string, candidateName: string, stage: string, vacancyId: string) => {
    setPendingCandidateId(candidateId)
    setPendingCandidateName(candidateName)
    setPendingStage(stage)
    setPendingVacancyId(vacancyId)
    setSendMessage(true)
    setStageMessageText("")
    setStageDialogOpen(true)
  }

  // Открыть диалог для bulk-действия
  const openBulkStageDialog = (stage: string) => {
    if (selected.size === 0) return
    setPendingCandidateId(null)
    setPendingCandidateName(null)
    setPendingStage(stage)
    // При bulk vacancyId может быть разным — передаём null, тумблер покажет общий текст
    // На практике у большинства HR все выбранные кандидаты в одной вакансии,
    // но для безопасности берём vacancyId первого выбранного.
    const firstId = [...selected][0]
    const firstCandidate = candidates.find(c => c.id === firstId)
    setPendingVacancyId(firstCandidate?.vacancyId ?? null)
    setSendMessage(true)
    setStageMessageText("")
    setStageDialogOpen(true)
  }

  // Подтвердить смену стадии из диалога
  const confirmStageChange = async () => {
    if (!pendingStage) return
    const override = stageMessageText.trim() || null
    setStageDialogLoading(true)
    try {
      if (pendingCandidateId) {
        // Одиночный
        const res = await fetch(`/api/modules/hr/candidates/${pendingCandidateId}/stage`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: pendingStage,
            sendMessage,
            ...(override ? { messageOverride: override } : {}),
          }),
        })
        if (!res.ok) throw new Error()
        setCandidates(prev => prev.map(c => c.id === pendingCandidateId ? { ...c, stage: pendingStage } : c))
        toast.success(`${pendingCandidateName ?? "Кандидат"}: ${getStageLabel(pendingStage)}`)
      } else {
        // Bulk
        const ids = [...selected]
        await Promise.all(ids.map(id =>
          fetch(`/api/modules/hr/candidates/${id}/stage`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage: pendingStage,
              sendMessage,
              ...(override ? { messageOverride: override } : {}),
            }),
          })
        ))
        setCandidates(prev => prev.map(c => selected.has(c.id) ? { ...c, stage: pendingStage } : c))
        setSelected(new Set())
        toast.success(`${ids.length} кандидатов: ${getStageLabel(pendingStage)}`)
      }
      setStageDialogOpen(false)
      setPendingStage(null)
      setPendingCandidateId(null)
    } catch {
      toast.error("Ошибка смены этапа")
    } finally {
      setStageDialogLoading(false)
    }
  }

  // Обёртки для совместимости с существующими вызовами
  const changeStage = (candidateId: string, stage: string, candidateName: string) => {
    const c = candidates.find(x => x.id === candidateId)
    openStageDialog(candidateId, candidateName, stage, c?.vacancyId ?? "")
  }

  const bulkChangeStage = (stage: string) => openBulkStageDialog(stage)

  async function toggleFavorite(id: string) {
    const target = candidates.find(c => c.id === id)
    const next = !(target?.isFavorite ?? false)
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, isFavorite: next } : c))
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}/favorite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !next } : c))
      toast.error("Не удалось обновить избранное")
    }
  }

  const toggleColSort = (column: string) => {
    setColSort((prev) => {
      if (prev?.column !== column) return { column, dir: "asc" }
      if (prev.dir === "asc") return { column, dir: "desc" }
      return null
    })
  }

  // Полный список вакансий компании для выпадашки (раньше строился только из
  // загруженной страницы кандидатов → для больших тенантов был неполным, и
  // нужную вакансию нельзя было выбрать — часть B6).
  const [allVacancyTitles, setAllVacancyTitles] = useState<string[]>([])
  useEffect(() => {
    fetch("/api/modules/hr/vacancies")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const list = Array.isArray(data) ? data
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data?.data) ? data.data
          : []
        const titles = [...new Set(
          (list as { title?: string }[]).map(v => v?.title).filter((t): t is string => !!t)
        )].sort((a, b) => a.localeCompare(b, "ru"))
        setAllVacancyTitles(titles)
      })
      .catch(() => {})
  }, [])

  const vacancyOptions = useMemo(() => {
    const titles = allVacancyTitles.length > 0
      ? allVacancyTitles
      : [...new Set(candidates.map(c => c.vacancyTitle).filter(Boolean))]
    return [{ value: "all", label: "Все вакансии" }, ...titles.map(t => ({ value: t, label: t }))]
  }, [allVacancyTitles, candidates])

  // Фильтрация — серверная (filterParams). Здесь только клиентская сортировка
  // уже загруженных строк (B6: убрали клиентские фильтры, ломавшие пагинацию).
  const filtered = useMemo(() => {
    return [...candidates].sort((a, b) => {
      if (!colSort) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      const mul = colSort.dir === "asc" ? 1 : -1
      if (colSort.column === "status") return mul * ((STATUS_ORDER[a.stage] ?? 9) - (STATUS_ORDER[b.stage] ?? 9))
      if (colSort.column === "date") return mul * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      if (colSort.column === "source") return mul * (a.source ?? "").localeCompare(b.source ?? "", "ru")
      if (colSort.column === "progress") return mul * ((a.progressPercent ?? -1) - (b.progressPercent ?? -1))
      if (colSort.column === "blocks") return mul * (a.demoCompletedBlocks - b.demoCompletedBlocks)
      return 0
    })
  }, [candidates, colSort])

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))
  const toggleOne = (id: string) => { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleAll = () => { allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map((c) => c.id))) }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 px-4 sm:px-14">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold text-foreground">Кандидаты</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {filtered.length} из {candidates.length}
                  {total > candidates.length ? ` (всего ${total})` : ""} кандидатов
                </p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-[2] min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Поиск по фамилии..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className={cn("pl-9", FILTER_INPUT)} />
              </div>
              <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
                <SelectTrigger className={cn("flex-1 min-w-0", FILTER_INPUT)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {vacancyOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={cn("flex-1 min-w-0", FILTER_INPUT)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className={cn("flex-1 min-w-0", FILTER_INPUT)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_FILTER.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={favoriteOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setFavoriteOnly((v) => !v)}
                className={cn(
                  "h-10 gap-2 shrink-0",
                  favoriteOnly && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500",
                )}
                aria-pressed={favoriteOnly}
                title={favoriteOnly ? "Показать всех" : "Только избранные"}
              >
                <Star className={cn("size-4", favoriteOnly && "fill-current")} />
                <span className="hidden lg:inline">Избранные</span>
              </Button>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-sm font-medium text-primary mr-1">Выбрано: {selected.size}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={bulkLoading} onClick={() => bulkChangeStage("scheduled")}>
                  <UserPlus className="size-3.5" />На интервью
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={bulkLoading} onClick={() => bulkChangeStage("talent_pool")}>
                  <Archive className="size-3.5" />В резерв
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive" disabled={bulkLoading} onClick={() => bulkChangeStage("rejected")}>
                  <XCircle className="size-3.5" />Отказать
                </Button>
                {bulkLoading && <Loader2 className="size-4 animate-spin text-muted-foreground ml-1" />}
                <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setSelected(new Set())}>
                  Снять выделение
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">
                  {candidates.length === 0 ? "Нет кандидатов" : "Кандидатов не найдено"}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {candidates.length === 0 ? "Кандидаты появятся после первого отклика" : "Попробуйте изменить фильтры"}
                </p>
              </div>
            )}

            {/* Table */}
            {!loading && filtered.length > 0 && (
              <TableCard>
                <DataTable className="text-left">
                  <DataHead>
                    <DataSelectHeadCell checked={allSelected} onCheckedChange={toggleAll} />
                    <DataHeadCell width="40px" className="px-2"> </DataHeadCell>
                    <DataHeadCell>ФИО</DataHeadCell>
                    <DataHeadCell>Вакансия</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "status" ? colSort.dir : null} onSort={() => toggleColSort("status")}>Статус</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "progress" ? colSort.dir : null} onSort={() => toggleColSort("progress")}>Прогресс</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "blocks" ? colSort.dir : null} onSort={() => toggleColSort("blocks")}>Блоки</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "date" ? colSort.dir : null} onSort={() => toggleColSort("date")}>Дата отклика</DataHeadCell>
                    <DataHeadCell sortable sortDir={colSort?.column === "source" ? colSort.dir : null} onSort={() => toggleColSort("source")}>Источник</DataHeadCell>
                    <DataHeadCell width="60px">Действия</DataHeadCell>
                  </DataHead>
                  <tbody>
                    {filtered.map((c) => (
                      <DataRow
                        key={c.id}
                        onClick={() => router.push(`/hr/candidates/${c.id}`)}
                        className={cn("cursor-pointer", selected.has(c.id) && "bg-primary/[0.04]")}
                      >
                        <DataSelectCell checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                        <DataCell className="px-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(c.id) }}
                            className="inline-flex items-center justify-center p-1 rounded hover:bg-accent/60 transition-colors"
                            aria-label={c.isFavorite ? "Убрать из избранного" : "В избранное"}
                          >
                            <Star className={cn("size-4", c.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                          </button>
                        </DataCell>
                        <DataCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                              <AvatarFallback className="text-xs font-bold text-white" style={{ backgroundColor: avatarColor(c.id) }}>
                                {getInitials(c.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <Link href={`/hr/candidates/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:text-primary hover:underline transition-colors">{c.name}</Link>
                              <p className="text-xs text-muted-foreground">{c.city ?? ""}</p>
                            </div>
                          </div>
                        </DataCell>
                        <DataCell className="text-muted-foreground">{c.vacancyTitle}</DataCell>
                        <DataCell>
                          <Badge variant="outline" className={cn("border-0 text-xs", getStageColorClasses(c.stage))}>
                            {getStageLabel(c.stage)}
                          </Badge>
                        </DataCell>
                        <DataCell>
                          {c.progressPercent === null || c.demoTotalBlocks === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={cn("font-medium tabular-nums", progressTextClass(c.progressPercent, c.isActive))}>
                              {c.progressPercent}%
                            </span>
                          )}
                        </DataCell>
                        <DataCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                          {c.demoTotalBlocks === 0 ? "—" : `${Math.min(c.demoCompletedBlocks, c.demoTotalBlocks)} / ${c.demoTotalBlocks}`}
                        </DataCell>
                        <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(c.createdAt)}</DataCell>
                        <DataCell className="text-muted-foreground">{SOURCE_LABELS[c.source ?? ""] ?? c.source ?? "—"}</DataCell>
                        <DataCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2 text-xs" onClick={() => router.push(`/hr/candidates/${c.id}`)}>
                                <Eye className="w-3.5 h-3.5" />Открыть карточку
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-xs" onClick={() => changeStage(c.id, "scheduled", c.name)}>
                                <UserPlus className="w-3.5 h-3.5" />Пригласить на интервью
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs" onClick={() => changeStage(c.id, "talent_pool", c.name)}>
                                <Archive className="w-3.5 h-3.5" />В резерв
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs text-destructive" onClick={() => changeStage(c.id, "rejected", c.name)}>
                                <XCircle className="w-3.5 h-3.5" />Отказать
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </DataCell>
                      </DataRow>
                    ))}
                  </tbody>
                </DataTable>
              </TableCard>
            )}

            {/* Load more — серверная пагинация по 50 строк */}
            {!loading && hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="gap-2"
                >
                  {loadingMore ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  Загрузить ещё ({total - candidates.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      {/* ═══ Диалог смены стадии (одиночный и bulk) ═══ */}
      <Dialog open={stageDialogOpen} onOpenChange={(open) => { setStageDialogOpen(open); if (!open) { setPendingStage(null); setPendingCandidateId(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingCandidateId && pendingCandidateName
                ? `${pendingCandidateName} → ${pendingStage ? getStageLabel(pendingStage) : ""}`
                : pendingStage
                  ? `${[...selected].length} кандидатов → ${getStageLabel(pendingStage)}`
                  : "Сменить стадию"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <StageMessageControl
              stage={pendingStage}
              vacancyId={pendingVacancyId}
              sendMessage={sendMessage}
              onSendMessageChange={setSendMessage}
              messageText={stageMessageText}
              onMessageTextChange={setStageMessageText}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setStageDialogOpen(false); setPendingStage(null); setPendingCandidateId(null) }}
              disabled={stageDialogLoading}
            >
              Отмена
            </Button>
            <Button onClick={confirmStageChange} disabled={stageDialogLoading}>
              {stageDialogLoading ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
