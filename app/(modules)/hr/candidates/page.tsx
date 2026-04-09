"use client"

import { useState, useEffect, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Search, Users, ListFilter, MoreHorizontal, UserPlus, Archive, XCircle, Loader2 } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

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
}

const STATUS_LABELS: Record<string, string> = {
  new: "Новый", demo: "На демо", scheduled: "Интервью назначено", interviewed: "Интервью пройдено",
  interview: "Интервью", decision: "Решение", offer: "Оффер", hired: "Принят",
  rejected: "Отказ", talent_pool: "Резерв", pending: "Ожидание",
}

const STATUS_COLORS: Record<string, string> = {
  new:          "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  demo:         "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  scheduled:    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  interviewed:  "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  interview:    "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  decision:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  offer:        "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hired:        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected:     "bg-muted text-muted-foreground",
  talent_pool:  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  pending:      "bg-gray-500/15 text-gray-600 dark:text-gray-400",
}

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

type ColumnSort = { column: string; dir: "asc" | "desc" } | null

function SortableHeader({
  label, column, current, onToggle,
}: {
  label: string; column: string; current: ColumnSort; onToggle: (col: string) => void
}) {
  const isActive = current?.column === column
  const dir = isActive ? current.dir : null
  return (
    <button type="button" onClick={() => onToggle(column)}
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider select-none transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <ListFilter className={cn("size-4 transition-transform", dir === "desc" && "scale-y-[-1]", !isActive && "opacity-40")} />
      {label}
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [vacancyFilter, setVacancyFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [colSort, setColSort] = useState<ColumnSort>({ column: "date", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/modules/hr/candidates")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setCandidates(Array.isArray(data) ? data : []))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false))
  }, [])

  const changeStage = async (candidateId: string, stage: string, candidateName: string) => {
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      })
      if (!res.ok) throw new Error()
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, stage } : c))
      toast.success(`${candidateName}: ${STATUS_LABELS[stage] ?? stage}`)
    } catch { toast.error("Ошибка смены этапа") }
  }

  const toggleColSort = (column: string) => {
    setColSort((prev) => {
      if (prev?.column !== column) return { column, dir: "asc" }
      if (prev.dir === "asc") return { column, dir: "desc" }
      return null
    })
  }

  // Dynamic vacancy filter options from data
  const vacancyOptions = useMemo(() => {
    const titles = [...new Set(candidates.map(c => c.vacancyTitle).filter(Boolean))]
    return [{ value: "all", label: "Все вакансии" }, ...titles.map(t => ({ value: t, label: t }))]
  }, [candidates])

  const filtered = useMemo(() => {
    let result = candidates

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((c) => c.name.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.stage === statusFilter)
    }
    if (vacancyFilter !== "all") {
      result = result.filter((c) => c.vacancyTitle === vacancyFilter)
    }
    if (sourceFilter !== "all") {
      result = result.filter((c) => c.source === sourceFilter)
    }

    result = [...result].sort((a, b) => {
      if (!colSort) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      const mul = colSort.dir === "asc" ? 1 : -1
      if (colSort.column === "status") return mul * ((STATUS_ORDER[a.stage] ?? 9) - (STATUS_ORDER[b.stage] ?? 9))
      if (colSort.column === "date") return mul * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      if (colSort.column === "source") return mul * (a.source ?? "").localeCompare(b.source ?? "", "ru")
      return 0
    })

    return result
  }, [candidates, search, statusFilter, vacancyFilter, sourceFilter, colSort])

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))
  const toggleOne = (id: string) => { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleAll = () => { allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map((c) => c.id))) }

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
                <h1 className="text-xl font-semibold text-foreground">Кандидаты</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} из {candidates.length} кандидатов</p>
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
            </div>

            {selected.size > 0 && <div className="text-xs text-muted-foreground mb-2">Выбрано: {selected.size}</div>}

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
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="pl-5 pr-2 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">ФИО</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Вакансия</th>
                      <th className="px-4 py-3"><SortableHeader label="Статус" column="status" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Дата отклика" column="date" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Источник" column="source" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3 w-[60px] text-xs font-medium text-muted-foreground uppercase tracking-wider">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <tr key={c.id}
                        className={cn("transition-colors cursor-pointer hover:bg-accent/40",
                          selected.has(c.id) && "bg-primary/[0.04]",
                          i < filtered.length - 1 && "border-b border-border/60",
                        )}>
                        <td className="pl-5 pr-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                              <AvatarFallback className="text-xs font-bold text-white" style={{ backgroundColor: avatarColor(c.id) }}>
                                {getInitials(c.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <Link href={`/hr/candidates/${c.id}`} className="text-sm font-medium text-foreground hover:text-primary hover:underline transition-colors">{c.name}</Link>
                              <p className="text-xs text-muted-foreground">{c.city ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{c.vacancyTitle}</td>
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className={cn("border-0 text-xs", STATUS_COLORS[c.stage] ?? "bg-muted text-muted-foreground")}>
                            {STATUS_LABELS[c.stage] ?? c.stage}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(c.createdAt)}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{SOURCE_LABELS[c.source ?? ""] ?? c.source ?? "—"}</td>
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
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
    </SidebarProvider>
  )
}
