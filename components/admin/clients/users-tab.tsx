"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell, DataSelectHeadCell, DataSelectCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import {
  Search, Building2, Lock, Unlock, MoreHorizontal, Loader2, UserCog, Trash2, RotateCcw, Eraser,
  UserPlus, KeyRound, Copy, Check, RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import {
  formatDate, useDebounce, ROLE_LABELS, CLIENT_ROLES, TableFooter,
  ACCESS_TYPE_OPTIONS, ACCESS_TYPE_LABELS,
} from "./shared"

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

interface CompanyOption {
  id: string
  name: string
}

const ROLE_FILTER = [
  { value: "all", label: "Все роли" },
  ...CLIENT_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] ?? r })),
  { value: "partner", label: ROLE_LABELS.partner },
]

const STATUS_FILTER = [
  { value: "all", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "blocked", label: "Заблокированные" },
]

const NO_COMPANY = "__none__"

// Пароль без неоднозначных символов (0/O, 1/l) — как в lib/partner/onboard.ts.
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let s = ""
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// Блок «копировать креды» — показываем владельцу после создания/смены пароля.
function CredsBox({ email, password }: { email?: string; password: string }) {
  const [copied, setCopied] = useState(false)
  const text = email ? `Логин: ${email}\nПароль: ${password}` : password
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
      {email && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Логин</span>
          <span className="font-mono">{email}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Пароль</span>
        <span className="font-mono font-medium">{password}</span>
      </div>
      <Button
        size="sm" variant="outline" className="w-full gap-1.5 mt-1"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Скопировано" : "Скопировать"}
      </Button>
    </div>
  )
}

export function UsersTab({ trashed = false }: { trashed?: boolean }) {
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Список компаний для селектов (создание/смена компании).
  const [companies, setCompanies] = useState<CompanyOption[]>([])

  // Диалог «Создать пользователя».
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: "", name: "", password: genPassword(), role: "director", companyId: NO_COMPANY,
  })
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null)

  // Диалог «Задать пароль».
  const [pwTarget, setPwTarget] = useState<UserRow | null>(null)
  const [pwValue, setPwValue] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSetCreds, setPwSetCreds] = useState<{ email: string; password: string } | null>(null)

  const pageIds = data.data.map(u => u.id)
  const allSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pageIds))

  // Массовые действия над выбранными.
  async function bulkRun(fn: (id: string) => Promise<Response>, okMsg: string) {
    if (selected.size === 0) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(fn))
      toast.success(`${okMsg}: ${selected.size}`)
      setSelected(new Set())
      fetchData()
    } catch { toast.error("Ошибка массового действия") } finally { setBulkBusy(false) }
  }
  const bulkBlock   = (active: boolean) => bulkRun(id => fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: active }) }), active ? "Разблокировано" : "Заблокировано")
  const bulkTrash   = () => bulkRun(id => fetch(`/api/admin/users/${id}`, { method: "DELETE" }), "В корзину")
  const bulkRestore = () => bulkRun(id => fetch(`/api/admin/users/${id}/restore`, { method: "POST" }), "Восстановлено")

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
  useEffect(() => { setPage(1); setSelected(new Set()) }, [debouncedSearch, roleFilter, statusFilter, pageSize, trashed])

  // Список компаний грузим один раз (для селектов).
  useEffect(() => {
    fetch("/api/admin/users?companiesList=true")
      .then(r => r.ok ? r.json() : null)
      .then(b => { if (b?.companies) setCompanies(b.companies) })
      .catch(() => {})
  }, [])

  async function patchUser(user: UserRow, payload: { role?: string; isActive?: boolean; companyId?: string | null }) {
    setBusyId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        if (payload.isActive === false) toast.success("Пользователь заблокирован")
        else if (payload.isActive === true) toast.success("Пользователь разблокирован")
        else if (payload.companyId !== undefined) toast.success("Компания изменена")
        else if (payload.role) toast.success(`Тип доступа изменён: ${ACCESS_TYPE_LABELS[payload.role] ?? ROLE_LABELS[payload.role] ?? payload.role}`)
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

  function openCreate() {
    setCreateForm({ email: "", name: "", password: genPassword(), role: "director", companyId: NO_COMPANY })
    setCreatedCreds(null)
    setCreateOpen(true)
  }

  async function submitCreate() {
    const email = createForm.email.trim()
    const name = createForm.name.trim()
    if (!email || !email.includes("@")) { toast.error("Укажите корректный email"); return }
    if (!name) { toast.error("Укажите имя"); return }
    if (createForm.password.length < 6) { toast.error("Пароль не короче 6 символов"); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, name, password: createForm.password, role: createForm.role,
          companyId: createForm.companyId === NO_COMPANY ? null : createForm.companyId,
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (res.ok) {
        setCreatedCreds({ email, password: createForm.password })
        toast.success("Пользователь создан")
        fetchData()
      } else {
        toast.error(b.error || "Не удалось создать")
      }
    } catch { toast.error("Ошибка сети") } finally { setCreating(false) }
  }

  function openSetPassword(user: UserRow) {
    setPwTarget(user)
    setPwValue(genPassword())
    setPwSetCreds(null)
  }

  async function submitSetPassword() {
    if (!pwTarget) return
    if (pwValue.length < 6) { toast.error("Пароль не короче 6 символов"); return }
    setPwSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${pwTarget.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwValue }),
      })
      const b = await res.json().catch(() => ({}))
      if (res.ok) {
        setPwSetCreds({ email: pwTarget.email, password: pwValue })
        toast.success("Пароль установлен")
      } else {
        toast.error(b.error || "Не удалось")
      }
    } catch { toast.error("Ошибка сети") } finally { setPwSaving(false) }
  }

  const clientOptions = ACCESS_TYPE_OPTIONS.filter(o => o.group === "client")
  const partnerOptions = ACCESS_TYPE_OPTIONS.filter(o => o.group === "partner")

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
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setCleanupOpen(true)}>
              <Eraser className="w-3.5 h-3.5" />Очистить
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
              <UserPlus className="w-4 h-4" />Создать пользователя
            </Button>
          </div>
        )}
      </div>

      {/* Массовые действия */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 rounded-lg border border-border bg-muted/40 px-4 py-2 flex-wrap">
          <span className="text-sm font-medium">Выбрано: {selected.size}</span>
          <div className="h-4 w-px bg-border" />
          {trashed ? (
            <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={bulkBusy} onClick={bulkRestore}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Восстановить
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => bulkBlock(false)}>
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}Заблокировать
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => bulkBlock(true)}>
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}Разблокировать
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-destructive hover:text-destructive" disabled={bulkBusy} onClick={bulkTrash}>
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}В корзину
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8 ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>Снять выбор</Button>
        </div>
      )}

      {/* Таблица */}
      <TableCard>
        <DataTable containerClassName="overflow-x-auto">
          <DataHead>
            <DataSelectHeadCell checked={allSelected} onCheckedChange={toggleAll} />
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
              <tr><td colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                {trashed ? "Корзина пуста" : "Нет пользователей по выбранным фильтрам"}
              </td></tr>
            )}
            {!loading && data.data.map(user => {
              const isBlocked = user.isActive === false
              const isBusy = busyId === user.id
              return (
                <DataRow key={user.id} className={cn("group", selected.has(user.id) && "bg-primary/[0.04]")}>
                  <DataSelectCell checked={selected.has(user.id)} onCheckedChange={() => toggleOne(user.id)} />
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
                                <DropdownMenuSubTrigger className="gap-2"><UserCog className="h-3.5 w-3.5" />Тип доступа</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuRadioGroup value={user.role === "partner" ? "" : user.role} onValueChange={(v) => { if (v && v !== user.role) patchUser(user, { role: v }) }}>
                                    <DropdownMenuLabel className="text-xs">Клиент</DropdownMenuLabel>
                                    {clientOptions.map(o => (
                                      <DropdownMenuRadioItem key={o.value} value={o.value} className="cursor-pointer">{o.label}</DropdownMenuRadioItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs">Партнёрство</DropdownMenuLabel>
                                    {partnerOptions.map(o => (
                                      <DropdownMenuRadioItem key={o.value} value={o.value} className="cursor-pointer" disabled={!user.companyId}>{o.label}</DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openSetPassword(user)}>
                                <KeyRound className="h-3.5 w-3.5" />Задать пароль
                              </DropdownMenuItem>
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

      {/* Создание пользователя */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreatedCreds(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать пользователя</DialogTitle>
            <DialogDescription>
              {createdCreds
                ? "Пользователь создан. Передайте эти данные для входа — пароль больше не показывается."
                : "Логин и пароль для доступа в систему. Тип доступа определяет права."}
            </DialogDescription>
          </DialogHeader>

          {createdCreds ? (
            <div className="space-y-3">
              <CredsBox email={createdCreds.email} password={createdCreds.password} />
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreatedCreds(null) }}>Готово</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cu-email">Email (логин)</Label>
                <Input id="cu-email" type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.ru" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-name">Имя</Label>
                <Input id="cu-name" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="Иван Петров" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-pw">Пароль</Label>
                <div className="flex gap-2">
                  <Input id="cu-pw" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" className="shrink-0" title="Сгенерировать" onClick={() => setCreateForm(f => ({ ...f, password: genPassword() }))}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Тип доступа</Label>
                <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {clientOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    {partnerOptions.map(o => (
                      <SelectItem key={o.value} value={o.value} disabled={createForm.companyId === NO_COMPANY}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {partnerOptions.some(o => o.value === createForm.role) && createForm.companyId === NO_COMPANY && (
                  <p className="text-xs text-destructive">Для партнёрского доступа выберите компанию.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Компания</Label>
                <Select value={createForm.companyId} onValueChange={v => setCreateForm(f => ({ ...f, companyId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COMPANY}>— без компании</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Отмена</Button>
                <Button onClick={submitCreate} disabled={creating} className="gap-1.5">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Создать
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Задать пароль */}
      <Dialog open={!!pwTarget} onOpenChange={(o) => { if (!o) { setPwTarget(null); setPwSetCreds(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Задать пароль</DialogTitle>
            <DialogDescription>
              {pwSetCreds
                ? "Пароль установлен. Передайте данные для входа — пароль больше не показывается."
                : <>Новый пароль для <span className="font-medium text-foreground">{pwTarget?.email}</span>. Старый перестанет работать.</>}
            </DialogDescription>
          </DialogHeader>

          {pwSetCreds ? (
            <div className="space-y-3">
              <CredsBox email={pwSetCreds.email} password={pwSetCreds.password} />
              <DialogFooter>
                <Button onClick={() => { setPwTarget(null); setPwSetCreds(null) }}>Готово</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw-value">Новый пароль</Label>
                <div className="flex gap-2">
                  <Input id="pw-value" value={pwValue} onChange={e => setPwValue(e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" className="shrink-0" title="Сгенерировать" onClick={() => setPwValue(genPassword())}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPwTarget(null)} disabled={pwSaving}>Отмена</Button>
                <Button onClick={submitSetPassword} disabled={pwSaving} className="gap-1.5">
                  {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Установить
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
