"use client"

import { useState, useMemo } from "react"
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
import { Search, Users, ListFilter } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types & constants ───────────────────────────────────────────────────────

interface Candidate {
  id: string
  name: string
  vacancy: string
  status: string
  appliedAt: string
  source: string
  city: string
  avatarColor: string
}

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  demo: "На демо",
  interview: "Интервью",
  offer: "Оффер",
  hired: "Принят",
  rejected: "Отказ",
}

const STATUS_COLORS: Record<string, string> = {
  new:       "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  demo:      "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  interview: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  offer:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hired:     "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected:  "bg-muted text-muted-foreground",
}

const STATUS_ORDER: Record<string, number> = {
  new: 0, demo: 1, interview: 2, offer: 3, hired: 4, rejected: 5,
}

const SOURCE_LABELS: Record<string, string> = {
  hh: "hh.ru",
  referral: "Реферал",
  direct: "Прямой",
}

const STATUS_FILTER = [
  { value: "all", label: "Все статусы" },
  { value: "new", label: "Новый" },
  { value: "demo", label: "На демо" },
  { value: "interview", label: "Интервью" },
  { value: "offer", label: "Оффер" },
  { value: "hired", label: "Принят" },
  { value: "rejected", label: "Отказ" },
]

const VACANCY_FILTER = [
  { value: "all", label: "Все вакансии" },
  { value: "Менеджер по продажам", label: "Менеджер по продажам" },
  { value: "Менеджер по продажам (копия)", label: "Менеджер по продажам (копия)" },
  { value: "Аккаунт-менеджер", label: "Аккаунт-менеджер" },
]

const SOURCE_FILTER = [
  { value: "all", label: "Все источники" },
  { value: "hh", label: "hh.ru" },
  { value: "referral", label: "Реферал" },
  { value: "direct", label: "Прямой" },
]

const FILTER_INPUT = "h-10 text-sm border border-gray-300 rounded-lg"

// ─── Mock data ───────────────────────────────────────────────────────────────

const CANDIDATES: Candidate[] = [
  { id: "1", name: "Иван Петров",       vacancy: "Менеджер по продажам", status: "interview", appliedAt: "2026-03-28T10:00:00Z", source: "hh",       city: "Москва",     avatarColor: "#8b5cf6" },
  { id: "2", name: "Мария Сидорова",    vacancy: "Менеджер по продажам", status: "demo",      appliedAt: "2026-03-30T14:20:00Z", source: "referral",  city: "СПб",        avatarColor: "#3b82f6" },
  { id: "3", name: "Алексей Козлов",    vacancy: "Аккаунт-менеджер",     status: "new",       appliedAt: "2026-04-01T09:15:00Z", source: "hh",       city: "Москва",     avatarColor: "#ef4444" },
  { id: "4", name: "Елена Волкова",     vacancy: "Менеджер по продажам", status: "offer",     appliedAt: "2026-03-20T11:00:00Z", source: "direct",    city: "Казань",     avatarColor: "#f59e0b" },
  { id: "5", name: "Сергей Морозов",    vacancy: "Менеджер по продажам (копия)", status: "hired", appliedAt: "2026-03-15T08:30:00Z", source: "hh",  city: "Москва",     avatarColor: "#22c55e" },
  { id: "6", name: "Ольга Новикова",    vacancy: "Аккаунт-менеджер",     status: "rejected",  appliedAt: "2026-03-25T16:45:00Z", source: "referral",  city: "СПб",        avatarColor: "#6b7280" },
  { id: "7", name: "Дмитрий Смирнов",   vacancy: "Менеджер по продажам", status: "new",       appliedAt: "2026-04-02T07:00:00Z", source: "direct",    city: "Екатеринбург", avatarColor: "#0ea5e9" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

// Column sort
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
      className={cn("inline-flex items-center gap-1.5 text-sm font-semibold select-none transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <ListFilter className={cn("size-4 transition-transform", dir === "desc" && "scale-y-[-1]", !isActive && "opacity-40")} />
      {label}
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [vacancyFilter, setVacancyFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [colSort, setColSort] = useState<ColumnSort>({ column: "date", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleColSort = (column: string) => {
    setColSort((prev) => {
      if (prev?.column !== column) return { column, dir: "asc" }
      if (prev.dir === "asc") return { column, dir: "desc" }
      return null
    })
  }

  const filtered = useMemo(() => {
    let result = CANDIDATES

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((c) => c.name.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter)
    }
    if (vacancyFilter !== "all") {
      result = result.filter((c) => c.vacancy === vacancyFilter)
    }
    if (sourceFilter !== "all") {
      result = result.filter((c) => c.source === sourceFilter)
    }

    result = [...result].sort((a, b) => {
      if (!colSort) return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      const mul = colSort.dir === "asc" ? 1 : -1
      if (colSort.column === "status") return mul * ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
      if (colSort.column === "date") return mul * (new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime())
      if (colSort.column === "source") return mul * a.source.localeCompare(b.source, "ru")
      return 0
    })

    return result
  }, [search, statusFilter, vacancyFilter, sourceFilter, colSort])

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
                <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} из {CANDIDATES.length} кандидатов</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
              {/* Поиск — 35% */}
              <div className="relative" style={{ flex: "0 0 35%" }}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Поиск по фамилии..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className={cn("pl-9", FILTER_INPUT)} />
              </div>
              {/* Вакансия — 25% */}
              <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
                <SelectTrigger className={FILTER_INPUT} style={{ flex: "0 0 25%" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VACANCY_FILTER.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Статус — 20% */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={FILTER_INPUT} style={{ flex: "0 0 20%" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Источник — 20% */}
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className={FILTER_INPUT} style={{ flex: "0 0 20%" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_FILTER.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {selected.size > 0 && <div className="text-xs text-muted-foreground mb-2">Выбрано: {selected.size}</div>}

            {/* Empty */}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Кандидатов не найдено</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Попробуйте изменить фильтры</p>
              </div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="pl-5 pr-2 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">ФИО</th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Вакансия</th>
                      <th className="px-4 py-3"><SortableHeader label="Статус" column="status" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Дата отклика" column="date" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Источник" column="source" current={colSort} onToggle={toggleColSort} /></th>
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
                              <AvatarFallback className="text-xs font-bold text-white" style={{ backgroundColor: c.avatarColor }}>
                                {getInitials(c.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.city}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{c.vacancy}</td>
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className={cn("border-0 text-xs", STATUS_COLORS[c.status])}>
                            {STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(c.appliedAt)}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{SOURCE_LABELS[c.source] ?? c.source}</td>
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
