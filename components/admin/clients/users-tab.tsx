"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import { Search, Building2, Lock, Unlock, MoreHorizontal, Loader2, UserCog, Trash2, RotateCcw, Eraser } from "lucide-react"
import { toast } from "sonner"
import { formatDate, useDebounce, ROLE_LABELS, CLIENT_ROLES, TableFooter } from "./shared"

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  companyId: string | null
  companyName: string | null
  isActive: boolean | null
  position: string | null
  createdAt: string | null
}

interface ApiResponse {
  data: UserRow[]
  total: number
  page: number
  totalPages: number
}

const ROLE_FILTER = [
  { value: "all", label: "Все роли" },
  ...CLIENT_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] ?? r })),
]

const STATUS_FILTER = [
  { value: "all", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "blocked", label: "Заблокированные" },
]

export function UsersTab({ trashed }: { trashed: boolean }) {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const debouncedSearch = useDebounce(search, 400)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], total: 0, page: 1, totalPages: 1 })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (debouncedSearch) q.set("search", debouncedSearch)
      if (roleFilter !== "all") q.set("role", roleFilter)
      if (statusFilter !== "all") q.set("status", statusFilter)
      if (trashed) q.set("trashed", "true")
      q.set("page", String(page))
      q.set("limit", String(pageSize))
      const res = await fetch(`/api/admin/users?${q.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, roleFilter, statusFilter, page, pageSize, trashed])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [debouncedSearch, roleFilter, statusFilter, pageSize, trashed])

  async function patchUser(user: UserRow, payload: { role?: string; isActive?: boolean }) {
    setBusyId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        if (payload.isActive === false) toast.success("Пользователь заблокирован")
        else if (payload.isActive === true) toast.success("Пользователь разблокирован")
        else if (payload.role) toast.success(`Роль изменена: ${ROLE_LABELS[payload.role] ?? payload.role}`)
        fetchData()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось обновить")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setBusyId(null)
    }
  }

  async function trashUser(user: UserRow) {
    setBusyId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      if (res.ok) { toast.success("Перемещён в корзину"); fetchData() }
      else { const b = await res.json().catch(() => ({})); toast.error(b.error || "Не удалось") }
    } catch { toast.error("Ошибка сети") } finally { setBusyId(null) }
  }

  async function restoreUser(user: UserRow) {
    setBusyId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/restore`, { method: "POST" })
      if (res.ok) { toast.success("Восстановлен"); fetchData() }
      else { const b = await res.json().catch(() => ({})); toast.error(b.error || "Не удалось") }
    } catch { toast.error("Ошибка сети") } finally { setBusyId(null) }
  }

  async function runCleanup() {
    setCleaning(true)
    try {
      const res = await fetch("/api/admin/users/cleanup", { method: "POST" })
      const b = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(b.trashed > 0 ? `В корзину перемещено: ${b.trashed}` : "Нечего чистить")
        setCleanupOpen(false)
        fetchData()
      } else toast.error(b.error || "Не удалось")
    } catch { toast.error("Ошибка сети") } finally { setCleaning(false) }
  }

  return (
    <>
      {/* Поиск и фильтры */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Поиск по имени, email, компании..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_FILTER.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTER.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {!trashed && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5 ml-auto" onClick={() => setCleanupOpen(true)}>
            <Eraser className="w-3.5 h-3.5" />Очистить
          </Button>
        )}
      </div>

      {/* Таблица */}
      <TableCard>
        <DataTable containerClassName="overflow-x-auto">
          <DataHead>
            <DataHeadCell>Имя</DataHeadCell>
            <DataHeadCell>Email</DataHeadCell>
            <DataHeadCell>Роль</DataHeadCell>
            <DataHeadCell>Компания</DataHeadCell>
            <DataHeadCell align="center">Статус</DataHeadCell>
            <DataHeadCell>Создан</DataHeadCell>
            <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
          </DataHead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                {trashed ? "Корзина пуста" : "Нет пользователей по выбранным фильтрам"}
              </td></tr>
            )}
            {!loading && data.data.map(user => {
              const isBlocked = user.isActive === false
              const isBusy = busyId === user.id
              return (
                <DataRow key={user.id} className="group">
                  <DataCell>
                    <p className="font-medium text-foreground truncate" title={user.name}>{user.name}</p>
                    {user.position && <p className="text-xs text-muted-foreground truncate">{user.position}</p>}
                  </DataCell>
                  <DataCell className="text-muted-foreground">{user.email}</DataCell>
                  <DataCell>
                    <Badge variant="outline" className="text-xs font-normal">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                  </DataCell>
                  <DataCell>
                    {user.companyId
                      ? <Link href={`/admin/clients/${user.companyId}`} className="text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[28ch]" title={user.companyName ?? ""}>{user.companyName ?? "—"}</span>
                        </Link>
                      : <span className="text-muted-foreground">— без компании</span>}
                  </DataCell>
                  <DataCell align="center">
                    <Badge variant="outline" className={cn("text-xs",
                      isBlocked
                        ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800")}>
                      {isBlocked ? "Заблокирован" : "Активен"}
                    </Badge>
                  </DataCell>
                  <DataCell className="text-foreground whitespace-nowrap">{formatDate(user.createdAt)}</DataCell>
                  <DataCell align="right">
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Действия" disabled={isBusy}>
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {user.companyId && (
                            <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                              <Link href={`/admin/clients/${user.companyId}`}><Building2 className="h-3.5 w-3.5" />Открыть компанию</Link>
                            </DropdownMenuItem>
                          )}
                          {trashed ? (
                            <>
                              {user.companyId && <DropdownMenuSeparator />}
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => restoreUser(user)}>
                                <RotateCcw className="h-3.5 w-3.5" />Восстановить
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-2"><UserCog className="h-3.5 w-3.5" />Сменить роль</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuLabel className="text-xs">Роль пользователя</DropdownMenuLabel>
                                  <DropdownMenuRadioGroup value={user.role} onValueChange={(v) => { if (v !== user.role) patchUser(user, { role: v }) }}>
                                    {CLIENT_ROLES.map(r => (
                                      <DropdownMenuRadioItem key={r} value={r} className="cursor-pointer">{ROLE_LABELS[r] ?? r}</DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem
                                className={cn("gap-2 cursor-pointer", !isBlocked && "text-destructive focus:text-destructive")}
                                onClick={() => patchUser(user, { isActive: isBlocked })}
                              >
                                {isBlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                {isBlocked ? "Разблокировать" : "Заблокировать"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => trashUser(user)}>
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
        emptyText={trashed ? "Корзина пуста" : "Нет пользователей"}
      />

      {/* Очистка: наблюдатели + осиротевшие → в корзину */}
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Очистить список?</DialogTitle>
            <DialogDescription>
              В корзину будут перемещены: пользователи с ролью «Наблюдатель» (обычно демо) и осиротевшие — без компании или с несуществующей компанией. Действие обратимо (восстановление из «Корзины»).
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setCleanupOpen(false)} disabled={cleaning}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={runCleanup} disabled={cleaning} className="gap-1.5">
              {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}В корзину
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
