"use client"

import {Suspense, useCallback, useEffect, useState} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  Shield, Search, Building2, Eye, Lock, CalendarPlus, MoreHorizontal,
  ChevronLeft, ChevronRight, Loader2,
} from "lucide-react"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string
  name: string
  inn: string | null
  subscriptionStatus: string | null
  trialEndsAt: string | null
  createdAt: string | null
  planName: string | null
  planPrice: number | null
  mrr: number
  userCount: number
  directorEmail: string | null
}

interface ApiResponse {
  data: ClientRow[]
  total: number
  page: number
  totalPages: number
}

// ─── Константы ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активен",  color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  trial:     { label: "Пробный",  color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  expired:   { label: "Истёк",    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  overdue:   { label: "Просрочен",color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  cancelled: { label: "Отменён",  color: "bg-muted text-muted-foreground border-border" },
  paused:    { label: "Пауза",    color: "bg-muted text-muted-foreground border-border" },
}

const SORT_OPTIONS = [
  { value: "created_at", label: "Дата регистрации" },
  { value: "name",       label: "Название" },
  { value: "mrr",        label: "MRR" },
]

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function formatPrice(price: number | null) {
  if (price === null) return "—"
  return price.toLocaleString("ru-RU") + " ₽"
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("ru-RU")
}

// ─── Хук debounce ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// ─── Основная страница ────────────────────────────────────────────────────────

function AdminClientsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [sort, setSort] = useState(searchParams.get("sort") ?? "created_at")
  const [page, setPage] = useState(parseInt(searchParams.get("page") ?? "1"))
  const [statusFilters, setStatusFilters] = useState<string[]>(
    searchParams.get("status")?.split(",").filter(Boolean) ?? []
  )

  const debouncedSearch = useDebounce(search, 400)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], total: 0, page: 1, totalPages: 1 })
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [blockingId, setBlockingId] = useState<string | null>(null)

  // Загрузка данных
  const fetchData = useCallback(async (params: {
    search: string, status: string[], page: number, sort: string
  }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (params.search) q.set("search", params.search)
      if (params.status.length > 0) q.set("status", params.status.join(","))
      q.set("page", String(params.page))
      q.set("sort", params.sort)
      q.set("limit", "20")

      const res = await fetch(`/api/admin/clients?${q.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData({ search: debouncedSearch, status: statusFilters, page, sort })
  }, [debouncedSearch, statusFilters, page, sort, fetchData])

  // При изменении фильтров сбрасываем на первую страницу
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilters, sort])

  function toggleStatus(status: string) {
    setStatusFilters(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  async function handleExtend(client: ClientRow) {
    setExtendingId(client.id)
    try {
      const base = client.trialEndsAt ? new Date(client.trialEndsAt) : new Date()
      const newDate = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000)
      const res = await fetch(`/api/admin/clients/${client.id}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialEndsAt: newDate.toISOString() }),
      })
      if (res.ok) {
        fetchData({ search: debouncedSearch, status: statusFilters, page, sort })
      }
    } finally {
      setExtendingId(null)
    }
  }

  async function handleBlock(client: ClientRow) {
    const isBlocked = client.subscriptionStatus === "paused"
    setBlockingId(client.id)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: isBlocked ? "active" : "paused" }),
      })
      if (res.ok) {
        fetchData({ search: debouncedSearch, status: statusFilters, page, sort })
      }
    } finally {
      setBlockingId(null)
    }
  }

  const statusLabels: Record<string, string> = {
    trial:   "Пробный",
    active:  "Активен",
    expired: "Истёк",
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Заголовок */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-5 h-5 text-primary" />
                  <h1 className="text-2xl font-semibold text-foreground">Клиенты</h1>
                </div>
                <p className="text-muted-foreground text-sm">Управление клиентскими аккаунтами</p>
              </div>
            </div>

            {/* Поиск и фильтры */}
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Поиск */}
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-9"
                    placeholder="Поиск по названию, ИНН, email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>

                {/* Сортировка */}
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-[190px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Фильтр по статусу */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs text-muted-foreground">Статус:</span>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <div key={value} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`status-${value}`}
                      checked={statusFilters.includes(value)}
                      onCheckedChange={() => toggleStatus(value)}
                    />
                    <Label htmlFor={`status-${value}`} className="text-sm cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Таблица */}
            <TableCard>
              <DataTable containerClassName="overflow-x-auto">
                <DataHead>
                  <DataHeadCell sortable sortDir={sort === "name" ? "desc" : null} onSort={() => setSort("name")}>Компания</DataHeadCell>
                  <DataHeadCell>ИНН</DataHeadCell>
                  <DataHeadCell>Тариф</DataHeadCell>
                  <DataHeadCell align="center">Статус</DataHeadCell>
                  <DataHeadCell align="right">Польз.</DataHeadCell>
                  <DataHeadCell sortable sortDir={sort === "created_at" ? "desc" : null} onSort={() => setSort("created_at")}>Дата</DataHeadCell>
                  <DataHeadCell align="right" sortable sortDir={sort === "mrr" ? "desc" : null} onSort={() => setSort("mrr")}>MRR ₽</DataHeadCell>
                  <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
                </DataHead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  )}
                  {!loading && data.data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                        Нет клиентов по выбранным фильтрам
                      </td>
                    </tr>
                  )}
                  {!loading && data.data.map(client => {
                    const statusCfg = STATUS_CONFIG[client.subscriptionStatus ?? ""] ?? {
                      label: client.subscriptionStatus ?? "—", color: ""
                    }
                    const isBlocking = blockingId === client.id
                    const isExtending = extendingId === client.id
                    const isBlocked = client.subscriptionStatus === "paused"

                    return (
                      <DataRow key={client.id} className="group">
                        <DataCell>
                          <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2.5 group/name">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground group-hover/name:text-primary transition-colors">{client.name}</p>
                              {client.directorEmail && (
                                <p className="text-xs text-muted-foreground">{client.directorEmail}</p>
                              )}
                            </div>
                          </Link>
                        </DataCell>
                        <DataCell className="text-muted-foreground">{client.inn ?? "—"}</DataCell>
                        <DataCell>
                          {client.planName
                            ? <div>
                                <p className="font-medium text-foreground">{client.planName}</p>
                                <p className="text-xs text-muted-foreground">{formatPrice(client.planPrice)}</p>
                              </div>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </DataCell>
                        <DataCell align="center">
                          <Badge variant="outline" className={cn("text-xs", statusCfg.color)}>{statusCfg.label}</Badge>
                        </DataCell>
                        <DataCell align="right" className="text-foreground">{client.userCount}</DataCell>
                        <DataCell className="text-foreground">{formatDate(client.createdAt)}</DataCell>
                        <DataCell align="right" className="font-medium text-foreground">{client.mrr > 0 ? formatPrice(client.mrr) : "—"}</DataCell>
                        <DataCell align="right">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Действия">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                                  <Link href={`/admin/clients/${client.id}`}><Eye className="h-3.5 w-3.5" />Просмотр</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className={cn("gap-2 cursor-pointer", !isBlocked && "text-destructive focus:text-destructive")}
                                  disabled={isBlocking}
                                  onClick={() => handleBlock(client)}
                                >
                                  {isBlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                                  {isBlocked ? "Разблокировать" : "Заблокировать"}
                                </DropdownMenuItem>
                                {client.subscriptionStatus === "trial" && (
                                  <DropdownMenuItem className="gap-2 cursor-pointer" disabled={isExtending} onClick={() => handleExtend(client)}>
                                    {isExtending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                                    Продлить trial на 14 дней
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </DataCell>
                      </DataRow>
                    )
                  })}
                </tbody>
              </DataTable>
            </TableCard>

            {/* Пагинация */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Всего {data.total} клиентов, страница {data.page} из {data.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(p => p - 1)}
                    className="gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Назад
                  </Button>

                  {/* Номера страниц */}
                  {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(data.totalPages - 4, page - 2)) + i
                    if (p < 1 || p > data.totalPages) return null
                    return (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages || loading}
                    onClick={() => setPage(p => p + 1)}
                    className="gap-1"
                  >
                    Вперёд
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Итоговая строка */}
            {!loading && data.total > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Показано {data.data.length} из {data.total}
              </p>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function AdminClientsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Загрузка...</div>}>
      <AdminClientsInner />
    </Suspense>
  )
}
