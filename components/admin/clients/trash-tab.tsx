"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Building2, Users, FileText, RotateCcw, Trash, AlertTriangle, Loader2, Settings } from "lucide-react"
import { toast } from "sonner"
import { formatPrice, formatDate, ROLE_LABELS } from "./shared"

interface TrashCompany { id: string; name: string; inn: string | null; deletedAt: string | null }
interface TrashUser { id: string; name: string | null; email: string; role: string; companyId: string | null; companyName: string | null; deletedAt: string | null }
interface TrashInvoice { id: string; invoiceNumber: string; companyId: string; companyName: string | null; amountRub: number | null; createdAt: string | null }

interface TrashData {
  companies: TrashCompany[]
  users: TrashUser[]
  invoices: TrashInvoice[]
  counts: { companies: number; users: number; invoices: number; total: number }
}

type PermanentTarget = { id: string; name: string }

function SectionHeader({ icon: Icon, title, count }: { icon: typeof Building2; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-6 first:mt-0">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
        {count.toLocaleString("ru-RU")}
      </span>
    </div>
  )
}

// «Окончательно удалится через …» — отсчёт от момента попадания в корзину
// (deletedAt у компаний/юзеров; createdAt у аннулированных счетов) + срок.
function CountdownCell({ since, retentionDays }: { since: string | null; retentionDays: number }) {
  if (!since) return <span className="text-muted-foreground">—</span>
  const dueMs = new Date(since).getTime() + retentionDays * 24 * 60 * 60 * 1000
  const diff = dueMs - Date.now()
  if (diff <= 0) {
    return <span className="text-destructive whitespace-nowrap">при ближайшей чистке</span>
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
  let label: string
  if (days >= 1) label = `${days} дн.`
  else if (hours >= 1) label = `${hours} ч.`
  else label = `${minutes} мин.`
  return <span className="text-muted-foreground whitespace-nowrap" title={`Дата: ${formatDate(new Date(dueMs).toISOString())}`}>через {label}</span>
}

// Email удалённого юзера часто анонимизирован при удалении
// (deleted__<uuid>@deleted.local) — это мусор, показываем чистую пометку.
function isAnonymizedEmail(email: string): boolean {
  return /^deleted__.+@deleted\.local$/i.test(email)
}

const RETENTION_OPTIONS = [1, 3, 7, 14, 30, 60, 90]

export function TrashTab({ onChanged }: { onChanged?: () => void }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TrashData>({ companies: [], users: [], invoices: [], counts: { companies: 0, users: 0, invoices: 0, total: 0 } })
  const [busyId, setBusyId] = useState<string | null>(null)

  const [retentionDays, setRetentionDays] = useState(7)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingRetention, setSavingRetention] = useState(false)

  const [permanentTarget, setPermanentTarget] = useState<PermanentTarget | null>(null)
  const [permanentBusy, setPermanentBusy] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, sRes] = await Promise.all([
        fetch("/api/admin/trash"),
        fetch("/api/admin/trash/settings"),
      ])
      if (tRes.ok) setData(await tRes.json())
      if (sRes.ok) { const s = await sRes.json(); if (typeof s.retentionDays === "number") setRetentionDays(s.retentionDays) }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const refetch = () => { fetchData(); onChanged?.() }

  async function saveRetention(days: number) {
    setSavingRetention(true)
    try {
      const res = await fetch("/api/admin/trash/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: days }),
      })
      if (res.ok) { setRetentionDays(days); toast.success(`Срок хранения: ${days} дн.`) }
      else toast.error("Не удалось сохранить срок")
    } catch { toast.error("Ошибка сети") } finally { setSavingRetention(false) }
  }

  async function restoreCompany(c: TrashCompany) {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/admin/clients/${c.id}/restore`, { method: "POST" })
      if (res.ok) { toast.success("Компания восстановлена"); refetch() }
      else toast.error("Не удалось восстановить")
    } catch { toast.error("Ошибка сети") } finally { setBusyId(null) }
  }

  async function restoreUser(u: TrashUser) {
    setBusyId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}/restore`, { method: "POST" })
      if (res.ok) { toast.success("Пользователь восстановлен"); refetch() }
      else toast.error("Не удалось восстановить")
    } catch { toast.error("Ошибка сети") } finally { setBusyId(null) }
  }

  async function restoreInvoice(inv: TrashInvoice) {
    setBusyId(inv.id)
    try {
      const res = await fetch(`/api/admin/invoices/${inv.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "issued" }),
      })
      if (res.ok) { toast.success("Счёт восстановлен"); refetch() }
      else toast.error("Не удалось восстановить")
    } catch { toast.error("Ошибка сети") } finally { setBusyId(null) }
  }

  async function handlePermanent() {
    if (!permanentTarget) return
    setPermanentBusy(true)
    try {
      const res = await fetch(`/api/admin/clients/${permanentTarget.id}/permanent`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Компания удалена навсегда")
        setPermanentTarget(null); refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось удалить")
      }
    } catch { toast.error("Ошибка сети") } finally { setPermanentBusy(false) }
  }

  if (loading && data.counts.total === 0) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
  }

  // Шапка с описанием + шестерёнка настройки срока (видна всегда, в т.ч. при пустой корзине).
  const header = (
    <div className="flex items-start justify-between gap-4 mb-4">
      <p className="text-sm text-muted-foreground">
        Всё удалённое в одном месте: компании, пользователи и аннулированные счета.
        Автоматически удаляются навсегда через <span className="font-medium text-foreground">{retentionDays} дн.</span> после попадания в корзину.
      </p>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => setSettingsOpen(true)}>
        <Settings className="h-3.5 w-3.5" />Настройка
      </Button>
    </div>
  )

  const settingsDialog = (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings className="size-4" />Настройка Корзины</DialogTitle>
          <DialogDescription>
            Через сколько дней содержимое корзины (компании, пользователи, аннулированные счета) удаляется навсегда. Отсчёт — от момента попадания в корзину.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm text-muted-foreground">Удалять через</span>
          <Select value={String(retentionDays)} onValueChange={(v) => saveRetention(Number(v))} disabled={savingRetention}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map(d => <SelectItem key={d} value={String(d)}>{d} дн.</SelectItem>)}
            </SelectContent>
          </Select>
          {savingRetention && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </DialogContent>
    </Dialog>
  )

  if (!loading && data.counts.total === 0) {
    return (
      <>
        {header}
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Trash className="w-8 h-8 mx-auto mb-3 opacity-40" />
          Корзина пуста
        </div>
        {settingsDialog}
      </>
    )
  }

  return (
    <>
      {header}

      {/* Компании */}
      {data.companies.length > 0 && (
        <>
          <SectionHeader icon={Building2} title="Компании" count={data.counts.companies} />
          <TableCard>
            <DataTable containerClassName="overflow-x-auto">
              <DataHead>
                <DataHeadCell>Компания</DataHeadCell>
                <DataHeadCell width="150px">ИНН</DataHeadCell>
                <DataHeadCell width="130px">Удалена</DataHeadCell>
                <DataHeadCell width="150px">Удалится</DataHeadCell>
                <DataHeadCell align="right" width="220px">Действия</DataHeadCell>
              </DataHead>
              <tbody>
                {data.companies.map(c => (
                  <DataRow key={c.id} className="group">
                    <DataCell className="font-medium text-foreground"><div className="max-w-[360px] truncate" title={c.name}>{c.name}</div></DataCell>
                    <DataCell className="text-muted-foreground whitespace-nowrap">{c.inn ?? "—"}</DataCell>
                    <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(c.deletedAt)}</DataCell>
                    <DataCell><CountdownCell since={c.deletedAt} retentionDays={retentionDays} /></DataCell>
                    <DataCell align="right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busyId === c.id} onClick={() => restoreCompany(c)}>
                          {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Восстановить
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-destructive hover:text-destructive" onClick={() => setPermanentTarget({ id: c.id, name: c.name })}>
                          <Trash className="h-3.5 w-3.5" />Удалить
                        </Button>
                      </div>
                    </DataCell>
                  </DataRow>
                ))}
              </tbody>
            </DataTable>
          </TableCard>
        </>
      )}

      {/* Пользователи */}
      {data.users.length > 0 && (
        <>
          <SectionHeader icon={Users} title="Пользователи" count={data.counts.users} />
          <TableCard>
            <DataTable containerClassName="overflow-x-auto">
              <DataHead>
                <DataHeadCell width="170px">Имя</DataHeadCell>
                <DataHeadCell>Email</DataHeadCell>
                <DataHeadCell width="130px">Роль</DataHeadCell>
                <DataHeadCell>Компания</DataHeadCell>
                <DataHeadCell width="130px">Удалён</DataHeadCell>
                <DataHeadCell width="150px">Удалится</DataHeadCell>
                <DataHeadCell align="right" width="160px">Действия</DataHeadCell>
              </DataHead>
              <tbody>
                {data.users.map(u => (
                  <DataRow key={u.id} className="group">
                    <DataCell className="font-medium text-foreground"><div className="max-w-[160px] truncate" title={u.name ?? undefined}>{u.name ?? "—"}</div></DataCell>
                    <DataCell className="text-muted-foreground">
                      {isAnonymizedEmail(u.email)
                        ? <span className="italic text-muted-foreground/60 whitespace-nowrap">освобождён при удалении</span>
                        : <div className="max-w-[260px] truncate" title={u.email}>{u.email}</div>}
                    </DataCell>
                    <DataCell className="text-muted-foreground whitespace-nowrap">{ROLE_LABELS[u.role] ?? u.role}</DataCell>
                    <DataCell className="text-muted-foreground">
                      {u.companyName
                        ? <Link href={`/admin/clients/${u.companyId}`} className="block max-w-[200px] truncate hover:text-primary hover:underline" title={u.companyName}>{u.companyName}</Link>
                        : "—"}
                    </DataCell>
                    <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(u.deletedAt)}</DataCell>
                    <DataCell><CountdownCell since={u.deletedAt} retentionDays={retentionDays} /></DataCell>
                    <DataCell align="right">
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busyId === u.id} onClick={() => restoreUser(u)}>
                          {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Восстановить
                        </Button>
                      </div>
                    </DataCell>
                  </DataRow>
                ))}
              </tbody>
            </DataTable>
          </TableCard>
        </>
      )}

      {/* Счета (аннулированные) */}
      {data.invoices.length > 0 && (
        <>
          <SectionHeader icon={FileText} title="Счета (аннулированные)" count={data.counts.invoices} />
          <TableCard>
            <DataTable containerClassName="overflow-x-auto">
              <DataHead>
                <DataHeadCell width="150px">Номер</DataHeadCell>
                <DataHeadCell>Компания</DataHeadCell>
                <DataHeadCell align="right" width="140px">Сумма</DataHeadCell>
                <DataHeadCell width="130px">Создан</DataHeadCell>
                <DataHeadCell width="150px">Удалится</DataHeadCell>
                <DataHeadCell align="right" width="160px">Действия</DataHeadCell>
              </DataHead>
              <tbody>
                {data.invoices.map(inv => (
                  <DataRow key={inv.id} className="group">
                    <DataCell className="font-medium text-foreground whitespace-nowrap">{inv.invoiceNumber}</DataCell>
                    <DataCell className="text-muted-foreground">
                      {inv.companyName
                        ? <Link href={`/admin/clients/${inv.companyId}`} className="block max-w-[260px] truncate hover:text-primary hover:underline" title={inv.companyName}>{inv.companyName}</Link>
                        : "—"}
                    </DataCell>
                    <DataCell align="right" className="font-medium text-foreground whitespace-nowrap">{inv.amountRub != null ? formatPrice(inv.amountRub) : "—"}</DataCell>
                    <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(inv.createdAt)}</DataCell>
                    <DataCell><CountdownCell since={inv.createdAt} retentionDays={retentionDays} /></DataCell>
                    <DataCell align="right">
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busyId === inv.id} onClick={() => restoreInvoice(inv)} title="Вернуть в статус «Выставлен»">
                          {busyId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Восстановить
                        </Button>
                      </div>
                    </DataCell>
                  </DataRow>
                ))}
              </tbody>
            </DataTable>
          </TableCard>
        </>
      )}

      {settingsDialog}

      {/* Удалить навсегда — простое подтверждение (без ввода названия) */}
      <Dialog open={!!permanentTarget} onOpenChange={(o) => { if (!o) setPermanentTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />Удалить навсегда?
            </DialogTitle>
            <DialogDescription>
              Компания «{permanentTarget?.name}» и все её данные (пользователи, вакансии, кандидаты) будут удалены без возможности восстановления.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setPermanentTarget(null)} disabled={permanentBusy}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handlePermanent} disabled={permanentBusy} className="gap-1.5">
              {permanentBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}Удалить навсегда
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
