"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell, DataSelectHeadCell, DataSelectCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import {
  Shield, Search, Eye, Lock, Unlock, CalendarPlus, MoreHorizontal, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2,
} from "lucide-react"
import { toast } from "sonner"

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

// Фильтр по статусу — единый дропдаун (как на странице вакансий).
const STATUS_FILTER = [
  { value: "all",       label: "Все статусы" },
  { value: "trial",     label: "Пробный" },
  { value: "active",    label: "Активен" },
  { value: "paused",    label: "Пауза" },
  { value: "expired",   label: "Истёк" },
  { value: "overdue",   label: "Просрочен" },
  { value: "cancelled", label: "Отменён" },
]

const PAGE_SIZES = [20, 50, 100]

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
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [sort, setSort] = useState(searchParams.get("sort") ?? "created_at")
  const [page, setPage] = useState(parseInt(searchParams.get("page") ?? "1"))
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all")
  const [pageSize, setPageSize] = useState(20)

  const debouncedSearch = useDebounce(search, 400)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], total: 0, page: 1, totalPages: 1 })
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [blockingId, setBlockingId] = useState<string | null>(null)

  // Выбор строк + массовые действия
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Удаление компании (необратимо) — подтверждение вводом названия
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)
  const [deleteTyped, setDeleteTyped] = useState("")
  const [deleting, setDeleting] = useState(false)

  // Загрузка данных
  const fetchData = useCallback(async (params: {
    search: string, status: string, page: number, sort: string, pageSize: number
  }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (params.search) q.set("search", params.search)
      if (params.status && params.status !== "all") q.set("status", params.status)
      q.set("page", String(params.page))
      q.set("sort", params.sort)
      q.set("limit", String(params.pageSize))

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
    fetchData({ search: debouncedSearch, status: statusFilter, page, sort, pageSize })
  }, [debouncedSearch, statusFilter, page, sort, pageSize, fetchData])

  // При изменении фильтров/размера страницы сбрасываем на первую страницу
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, sort, pageSize])

  const refetch = () => fetchData({ search: debouncedSearch, status: statusFilter, page, sort, pageSize })

  // ── Выбор строк ────────────────────────────────────────────────────────────
  const pageIds = data.data.map(c => c.id)
  const allSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const toggleOne = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pageIds))

  // ── Массовые действия (по выбранным) — блокировка/разблокировка ──────────────
  async function bulkSetStatus(status: "paused" | "active") {
    if (selected.size === 0) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id =>
        fetch(`/api/admin/clients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionStatus: status }),
        })
      ))
      toast.success(status === "paused" ? `Заблокировано: ${selected.size}` : `Разблокировано: ${selected.size}`)
      setSelected(new Set())
      refetch()
    } catch {
      toast.error("Ошибка массового действия")
    } finally {
      setBulkBusy(false)
    }
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
      if (res.ok) refetch()
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
      if (res.ok) refetch()
    } finally {
      setBlockingId(null)
    }
  }

  // ── Удаление компании (необратимо) ───────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/clients/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Компания удалена")
        setDeleteTarget(null)
        setDeleteTyped("")
        refetch()
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || "Не удалось удалить")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setDeleting(false)
    }
  }
  const deleteConfirmed = deleteTarget !== null && deleteTyped.trim() === deleteTarget.name.trim()

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14">

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

            {/* Поиск и фильтры — в одну строку */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9"
                  placeholder="Поиск по названию, ИНН, email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Панель массовых действий над выбранными */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 mb-3 rounded-lg border border-border bg-muted/40 px-4 py-2">
                <span className="text-sm font-medium">Выбрано: {selected.size}</span>
                <div className="h-4 w-px bg-border" />
                <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => bulkSetStatus("paused")}>
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}Заблокировать
                </Button>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => bulkSetStatus("active")}>
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}Разблокировать
                </Button>
                <Button size="sm" variant="ghost" className="h-8 ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>
                  Снять выбор
                </Button>
              </div>
            )}

            {/* Таблица */}
            <TableCard>
              <DataTable containerClassName="overflow-x-auto">
                <DataHead>
                  <DataSelectHeadCell checked={allSelected} onCheckedChange={toggleAll} />
                  <DataHeadCell sortable sortDir={sort === "name" ? "desc" : null} onSort={() => setSort("name")}>Компания</DataHeadCell>
                  <DataHeadCell>ИНН</DataHeadCell>
                  <DataHeadCell>Тариф</DataHeadCell>
                  <DataHeadCell align="center">Статус</DataHeadCell>
                  <DataHeadCell align="right">Польз.</DataHeadCell>
                  <DataHeadCell sortable sortDir={sort === "created_at" ? "desc" : null} onSort={() => setSort("created_at")}>Дата</DataHeadCell>
                  <DataHeadCell align="right" sortable sortDir={sort === "mrr" ? "desc" : null} onSort={() => setSort("mrr")} className="whitespace-nowrap">MRR ₽</DataHeadCell>
                  <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
                </DataHead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={9} className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  )}
                  {!loading && data.data.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
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
                    const isActive = client.subscriptionStatus === "active"

                    return (
                      <DataRow key={client.id} className={cn("group", selected.has(client.id) && "bg-primary/[0.04]")}>
                        <DataSelectCell checked={selected.has(client.id)} onCheckedChange={() => toggleOne(client.id)} />
                        <DataCell>
                          <Link href={`/admin/clients/${client.id}`} className="block min-w-0">
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{client.name}</p>
                            {client.directorEmail && (
                              <p className="text-xs text-muted-foreground truncate">{client.directorEmail}</p>
                            )}
                          </Link>
                        </DataCell>
                        <DataCell className="text-muted-foreground">{client.inn ?? "—"}</DataCell>
                        <DataCell className="whitespace-nowrap">
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
                        <DataCell className="text-foreground whitespace-nowrap">{formatDate(client.createdAt)}</DataCell>
                        <DataCell align="right" className="font-medium text-foreground whitespace-nowrap">{client.mrr > 0 ? formatPrice(client.mrr) : "—"}</DataCell>
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                  disabled={isActive}
                                  title={isActive ? "Нельзя удалить компанию с активной подпиской" : undefined}
                                  onClick={() => { setDeleteTyped(""); setDeleteTarget(client) }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />Удалить
                                </DropdownMenuItem>
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

            {/* Футер: «Показано», пагинация, выбор размера страницы */}
            <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {data.total > 0 ? `Показано ${data.data.length} из ${data.total}` : "Нет данных"}
              </p>

              <div className="flex items-center gap-4 flex-wrap">
                {data.totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="gap-1">
                      <ChevronLeft className="w-4 h-4" />Назад
                    </Button>
                    {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                      const p = Math.max(1, Math.min(data.totalPages - 4, page - 2)) + i
                      if (p < 1 || p > data.totalPages) return null
                      return (
                        <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setPage(p)}>
                          {p}
                        </Button>
                      )
                    })}
                    <Button variant="outline" size="sm" disabled={page >= data.totalPages || loading} onClick={() => setPage(p => p + 1)} className="gap-1">
                      Вперёд<ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">По:</Label>
                  <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[76px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">на стр.</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Удаление компании — подтверждение вводом названия */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteTyped("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />Удалить компанию?
            </DialogTitle>
            <DialogDescription>
              Компания «{deleteTarget?.name}» будет удалена со всеми данными без возможности восстановления.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-company" className="text-xs">Введите название компании для подтверждения:</Label>
            <Input id="confirm-company" value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} placeholder={deleteTarget?.name} autoComplete="off" />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteTyped("") }} disabled={deleting}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!deleteConfirmed || deleting} className="gap-1.5">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
