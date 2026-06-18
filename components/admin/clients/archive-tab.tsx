"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Search, Eye, RotateCcw, Trash2, MoreHorizontal, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatPrice, formatDate, useDebounce, TableFooter } from "./shared"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string
  name: string
  inn: string | null
  subscriptionStatus: string | null
  trialEndsAt: string | null
  createdAt: string | null
  archivedAt: string | null
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активен",  color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  trial:     { label: "Пробный",  color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  expired:   { label: "Истёк",    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  overdue:   { label: "Просрочен",color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  cancelled: { label: "Отменён",  color: "bg-muted text-muted-foreground border-border" },
  paused:    { label: "Пауза",    color: "bg-muted text-muted-foreground border-border" },
}

interface ArchiveTabProps {
  onChanged?: () => void
}

export function ArchiveTab({ onChanged }: ArchiveTabProps) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const debouncedSearch = useDebounce(search, 400)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], total: 0, page: 1, totalPages: 1 })

  // Подтверждение «В корзину» из архива
  const [trashTarget, setTrashTarget] = useState<ClientRow | null>(null)
  const [trashing, setTrashing] = useState(false)

  const fetchData = useCallback(async (params: { search: string; page: number; pageSize: number }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (params.search) q.set("search", params.search)
      q.set("archived", "true")
      q.set("page", String(params.page))
      q.set("limit", String(params.pageSize))
      const res = await fetch(`/api/admin/clients?${q.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData({ search: debouncedSearch, page, pageSize })
  }, [debouncedSearch, page, pageSize, fetchData])

  useEffect(() => { setPage(1) }, [debouncedSearch, pageSize])

  const refetch = () => {
    fetchData({ search: debouncedSearch, page, pageSize })
    onChanged?.()
  }

  async function handleRestore(client: ClientRow) {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/archive`, { method: "DELETE" })
      if (!res.ok) { toast.error("Не удалось восстановить"); return }
      toast.success("Компания восстановлена из архива")
      refetch()
    } catch {
      toast.error("Ошибка сети")
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

  return (
    <>
      {/* Поиск */}
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
      </div>

      {/* Таблица */}
      <TableCard>
        <DataTable containerClassName="overflow-x-auto">
          <DataHead>
            <DataHeadCell width="44ch">Компания</DataHeadCell>
            <DataHeadCell>ИНН</DataHeadCell>
            <DataHeadCell>Тариф</DataHeadCell>
            <DataHeadCell align="center">Статус</DataHeadCell>
            <DataHeadCell align="right">Польз.</DataHeadCell>
            <DataHeadCell>Зарегистрирована</DataHeadCell>
            <DataHeadCell>В архиве с</DataHeadCell>
            <DataHeadCell align="right" className="whitespace-nowrap">MRR ₽</DataHeadCell>
            <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
          </DataHead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="text-center py-8">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
              </td></tr>
            )}
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                Архив пуст
              </td></tr>
            )}
            {!loading && data.data.map(client => {
              const statusCfg = STATUS_CONFIG[client.subscriptionStatus ?? ""] ?? { label: client.subscriptionStatus ?? "—", color: "" }
              return (
                <DataRow key={client.id} className="group">
                  <DataCell>
                    <div className="max-w-[44ch]">
                      <p className="font-medium text-foreground truncate" title={client.name}>{client.name}</p>
                      {client.directorEmail && <p className="text-xs text-muted-foreground truncate">{client.directorEmail}</p>}
                    </div>
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
                  <DataCell align="center">
                    <Badge variant="outline" className={cn("text-xs", statusCfg.color)}>{statusCfg.label}</Badge>
                  </DataCell>
                  <DataCell align="right" className="text-foreground">{client.userCount}</DataCell>
                  <DataCell className="text-foreground whitespace-nowrap">{formatDate(client.createdAt)}</DataCell>
                  <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(client.archivedAt)}</DataCell>
                  <DataCell align="right" className="font-medium text-foreground whitespace-nowrap">
                    {client.mrr > 0 ? formatPrice(client.mrr) : "—"}
                  </DataCell>
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
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleRestore(client)}>
                            <RotateCcw className="h-3.5 w-3.5" />Восстановить
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setTrashTarget(client)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />В корзину
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

      <TableFooter
        shown={data.data.length} total={data.total} page={page} totalPages={data.totalPages}
        loading={loading} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}
        emptyText="Архив пуст"
      />

      {/* В корзину — лёгкое подтверждение */}
      <Dialog open={!!trashTarget} onOpenChange={(o) => { if (!o) setTrashTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Переместить в корзину?</DialogTitle>
            <DialogDescription>
              Компания «{trashTarget?.name}» будет перемещена из архива в корзину. Вы сможете восстановить её позже.
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
    </>
  )
}
