"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell, DataSelectHeadCell, DataSelectCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import {
  Search, Eye, Lock, Unlock, CalendarPlus, MoreHorizontal, Trash2, Trash, RotateCcw, AlertTriangle, Loader2, Archive,
} from "lucide-react"
import { toast } from "sonner"
import { formatPrice, formatDate, useDebounce, TableFooter } from "./shared"
import { CompanySheet, type CompanySheetRow } from "./company-sheet"

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
  partnerName: string | null
  partnerIntegratorId: string | null
  linkStatus: string | null
}

interface ApiResponse {
  data: ClientRow[]
  total: number
  page: number
  totalPages: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активен",  color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  trial:     { label: "Пробный",  color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  expired:   { label: "Истёк",    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  overdue:   { label: "Просрочен",color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  cancelled: { label: "Отменён",  color: "bg-muted text-muted-foreground border-border" },
  paused:    { label: "Пауза",    color: "bg-muted text-muted-foreground border-border" },
}

const STATUS_FILTER = [
  { value: "all",       label: "Все статусы" },
  { value: "trial",     label: "Пробный" },
  { value: "active",    label: "Активен" },
  { value: "paused",    label: "Пауза" },
  { value: "expired",   label: "Истёк" },
  { value: "overdue",   label: "Просрочен" },
  { value: "cancelled", label: "Отменён" },
]

export function CompaniesTab({ trashed = false }: { trashed?: boolean }) {
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [sort, setSort] = useState(searchParams.get("sort") ?? "created_at")
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("all")
  const [pageSize, setPageSize] = useState(20)

  const debouncedSearch = useDebounce(search, 400)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], total: 0, page: 1, totalPages: 1 })
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [blockingId, setBlockingId] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [archiveTarget, setArchiveTarget] = useState<ClientRow | null>(null)
  const [archiving, setArchiving] = useState(false)

  const [trashTarget, setTrashTarget] = useState<ClientRow | null>(null)
  const [trashing, setTrashing] = useState(false)
  const [permanentTarget, setPermanentTarget] = useState<ClientRow | null>(null)
  const [permanentTyped, setPermanentTyped] = useState("")
  const [permanentBusy, setPermanentBusy] = useState(false)

  // Боковая панель компании (краткая сводка)
  const [sheetClient, setSheetClient] = useState<CompanySheetRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const openSheet = (client: ClientRow) => { setSheetClient(client); setSheetOpen(true) }

  const isTrash = trashed

  const fetchData = useCallback(async (params: {
    search: string, status: string, page: number, sort: string, pageSize: number, trashed: boolean
  }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (params.search) q.set("search", params.search)
      if (params.status && params.status !== "all") q.set("status", params.status)
      q.set("page", String(params.page))
      q.set("sort", params.sort)
      q.set("limit", String(params.pageSize))
      if (params.trashed) q.set("trashed", "true")

      const res = await fetch(`/api/admin/clients?${q.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData({ search: debouncedSearch, status: statusFilter, page, sort, pageSize, trashed: isTrash })
  }, [debouncedSearch, statusFilter, page, sort, pageSize, isTrash, fetchData])

  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [debouncedSearch, statusFilter, sort, pageSize, trashed])

  const refetch = () => fetchData({ search: debouncedSearch, status: statusFilter, page, sort, pageSize, trashed: isTrash })

  const pageIds = data.data.map(c => c.id)
  const allSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const toggleOne = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pageIds))

  async function bulkSetStatus(status: "paused" | "active") {
    if (selected.size === 0) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id =>
        fetch(`/api/admin/clients/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
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
        method: "PUT", headers: { "Content-Type": "application/json" },
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
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: isBlocked ? "active" : "paused" }),
      })
      if (res.ok) refetch()
    } finally {
      setBlockingId(null)
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/admin/clients/${archiveTarget.id}/archive`, { method: "POST" })
      if (res.ok) {
        toast.success("Компания перемещена в архив")
        setArchiveTarget(null)
        refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось переместить в архив")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setArchiving(false)
    }
  }

  async function handleTrash() {
    if (!trashTarget) return
    setTrashing(true)
    try {
      const res = await fetch(`/api/admin/clients/${trashTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Компания перемещена в корзину")
        setTrashTarget(null)
        refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось переместить")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setTrashing(false)
    }
  }

  async function handleRestore(client: ClientRow) {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/restore`, { method: "POST" })
      if (!res.ok) { toast.error("Не удалось восстановить"); return }
      toast.success("Компания восстановлена")
      refetch()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  async function handlePermanent() {
    if (!permanentTarget) return
    setPermanentBusy(true)
    try {
      const res = await fetch(`/api/admin/clients/${permanentTarget.id}/permanent`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Компания удалена навсегда")
        setPermanentTarget(null)
        setPermanentTyped("")
        refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось удалить")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setPermanentBusy(false)
    }
  }
  const permanentConfirmed = permanentTarget !== null && permanentTyped.trim() === permanentTarget.name.trim()

  return (
    <>
      {/* Поиск и фильтры */}
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

      {/* Панель массовых действий (только на активных) */}
      {!isTrash && selected.size > 0 && (
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
            {!isTrash && <DataSelectHeadCell checked={allSelected} onCheckedChange={toggleAll} />}
            <DataHeadCell sortable sortDir={sort === "name" ? "desc" : null} onSort={() => setSort("name")} width="44ch">Компания</DataHeadCell>
            <DataHeadCell>ИНН</DataHeadCell>
            <DataHeadCell>Тариф</DataHeadCell>
            <DataHeadCell>Партнёр</DataHeadCell>
            <DataHeadCell align="center">Статус</DataHeadCell>
            <DataHeadCell align="right">Польз.</DataHeadCell>
            <DataHeadCell sortable sortDir={sort === "created_at" ? "desc" : null} onSort={() => setSort("created_at")}>Дата</DataHeadCell>
            <DataHeadCell align="right" sortable sortDir={sort === "mrr" ? "desc" : null} onSort={() => setSort("mrr")} className="whitespace-nowrap">MRR ₽</DataHeadCell>
            <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
          </DataHead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                {isTrash ? "Корзина пуста" : "Нет клиентов по выбранным фильтрам"}
              </td></tr>
            )}
            {!loading && data.data.map(client => {
              const statusCfg = STATUS_CONFIG[client.subscriptionStatus ?? ""] ?? { label: client.subscriptionStatus ?? "—", color: "" }
              const isBlocking = blockingId === client.id
              const isExtending = extendingId === client.id
              const isBlocked = client.subscriptionStatus === "paused"

              return (
                <DataRow key={client.id} className={cn("group", selected.has(client.id) && "bg-primary/[0.04]")}>
                  {!isTrash && <DataSelectCell checked={selected.has(client.id)} onCheckedChange={() => toggleOne(client.id)} />}
                  <DataCell>
                    <button type="button" onClick={() => openSheet(client)} className="block max-w-[44ch] text-left">
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate" title={client.name}>{client.name}</p>
                      {client.directorEmail && <p className="text-xs text-muted-foreground truncate">{client.directorEmail}</p>}
                    </button>
                  </DataCell>
                  <DataCell className="text-muted-foreground">{client.inn ?? "—"}</DataCell>
                  <DataCell className="whitespace-nowrap">
                    {client.planName
                      ? <div>
                          <p className="font-medium text-foreground">{client.planName}</p>
                          <p className="text-xs text-muted-foreground">{formatPrice(client.planPrice)}</p>
                        </div>
                      : <span className="text-muted-foreground">—</span>}
                  </DataCell>
                  <DataCell className="whitespace-nowrap">
                    {client.partnerName
                      ? <span className="text-foreground">{client.partnerName}</span>
                      : <span className="text-muted-foreground">—</span>}
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

                          {isTrash ? (
                            <>
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleRestore(client)}>
                                <RotateCcw className="h-3.5 w-3.5" />Восстановить
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => { setPermanentTyped(""); setPermanentTarget(client) }}
                              >
                                <Trash className="h-3.5 w-3.5" />Удалить навсегда
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
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
                                className="gap-2 cursor-pointer"
                                onClick={() => setArchiveTarget(client)}
                              >
                                <Archive className="h-3.5 w-3.5" />В архив
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => setTrashTarget(client)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />В корзину
                              </DropdownMenuItem>
                            </>
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

      <TableFooter
        shown={data.data.length} total={data.total} page={page} totalPages={data.totalPages}
        loading={loading} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}
        emptyText={isTrash ? "Корзина пуста" : "Нет данных"}
      />

      {/* Боковая панель компании */}
      <CompanySheet client={sheetClient} open={sheetOpen} onOpenChange={setSheetOpen} onChanged={refetch} />

      {/* В архив — лёгкое подтверждение */}
      <Dialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Переместить в архив?</DialogTitle>
            <DialogDescription>
              Компания «{archiveTarget?.name}» будет скрыта из активного списка. Из архива можно восстановить или отправить в корзину.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setArchiveTarget(null)} disabled={archiving}>Отмена</Button>
            <Button variant="secondary" size="sm" onClick={handleArchive} disabled={archiving} className="gap-1.5">
              {archiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}В архив
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* В корзину — лёгкое подтверждение */}
      <Dialog open={!!trashTarget} onOpenChange={(o) => { if (!o) setTrashTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Переместить в корзину?</DialogTitle>
            <DialogDescription>
              Компания «{trashTarget?.name}» будет перемещена в корзину. Вы сможете восстановить её позже.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setTrashTarget(null)} disabled={trashing}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleTrash} disabled={trashing} className="gap-1.5">
              {trashing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}В корзину
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Удалить навсегда — подтверждение вводом названия */}
      <Dialog open={!!permanentTarget} onOpenChange={(o) => { if (!o) { setPermanentTarget(null); setPermanentTyped("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />Удалить навсегда?
            </DialogTitle>
            <DialogDescription>
              Компания «{permanentTarget?.name}» и все её данные (пользователи, вакансии, кандидаты) будут удалены без возможности восстановления.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-company" className="text-xs">Введите название компании для подтверждения:</Label>
            <Input id="confirm-company" value={permanentTyped} onChange={e => setPermanentTyped(e.target.value)} placeholder={permanentTarget?.name} autoComplete="off" />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => { setPermanentTarget(null); setPermanentTyped("") }} disabled={permanentBusy}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handlePermanent} disabled={!permanentConfirmed || permanentBusy} className="gap-1.5">
              {permanentBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}Удалить навсегда
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
