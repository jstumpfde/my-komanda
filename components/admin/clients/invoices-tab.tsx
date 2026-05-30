"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import { Search, Building2, CheckCircle2, XCircle, FileText, FileCheck2, MoreHorizontal, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatPrice, formatDate, useDebounce, TableFooter } from "./shared"

interface InvoiceRow {
  id: string
  invoiceNumber: string
  companyId: string
  companyName: string | null
  amountRub: number | null
  periodStart: string | null
  periodEnd: string | null
  status: string
  dueDate: string | null
  paidAt: string | null
  createdAt: string | null
}

interface ApiResponse {
  data: InvoiceRow[]
  total: number
  page: number
  totalPages: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: "Ожидает",    color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  issued:    { label: "Выставлен",  color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  paid:      { label: "Оплачен",    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  cancelled: { label: "Аннулирован",color: "bg-muted text-muted-foreground border-border" },
}

const STATUS_FILTER = [
  { value: "all",       label: "Все статусы" },
  { value: "pending",   label: "Ожидает" },
  { value: "issued",    label: "Выставлен" },
  { value: "paid",      label: "Оплачен" },
  { value: "cancelled", label: "Аннулирован" },
]

function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "—"
  return `${formatDate(start)} — ${formatDate(end)}`
}

export function InvoicesTab() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const debouncedSearch = useDebounce(search, 400)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], total: 0, page: 1, totalPages: 1 })
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (debouncedSearch) q.set("search", debouncedSearch)
      if (statusFilter !== "all") q.set("status", statusFilter)
      q.set("page", String(page))
      q.set("limit", String(pageSize))
      const res = await fetch(`/api/admin/invoices?${q.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, pageSize])

  async function setStatus(invoice: InvoiceRow, status: "paid" | "cancelled") {
    setBusyId(invoice.id)
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        toast.success(status === "paid" ? "Счёт отмечен оплаченным" : "Счёт аннулирован")
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

  return (
    <>
      {/* Поиск и фильтры */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Поиск по номеру счёта или компании..."
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

      {/* Таблица */}
      <TableCard>
        <DataTable containerClassName="overflow-x-auto">
          <DataHead>
            <DataHeadCell>Номер</DataHeadCell>
            <DataHeadCell>Компания</DataHeadCell>
            <DataHeadCell align="right">Сумма</DataHeadCell>
            <DataHeadCell>Период</DataHeadCell>
            <DataHeadCell align="center">Статус</DataHeadCell>
            <DataHeadCell>Срок</DataHeadCell>
            <DataHeadCell>Оплачен</DataHeadCell>
            <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
          </DataHead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Нет счетов по выбранным фильтрам</td></tr>
            )}
            {!loading && data.data.map(inv => {
              const statusCfg = STATUS_CONFIG[inv.status] ?? { label: inv.status, color: "" }
              const isBusy = busyId === inv.id
              const isFinal = inv.status === "paid" || inv.status === "cancelled"
              return (
                <DataRow key={inv.id} className="group">
                  <DataCell className="font-medium text-foreground whitespace-nowrap">{inv.invoiceNumber}</DataCell>
                  <DataCell>
                    <Link href={`/admin/clients/${inv.companyId}`} className="text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[28ch]" title={inv.companyName ?? ""}>{inv.companyName ?? "—"}</span>
                    </Link>
                  </DataCell>
                  <DataCell align="right" className="font-medium text-foreground whitespace-nowrap">{formatPrice(inv.amountRub)}</DataCell>
                  <DataCell className="text-muted-foreground whitespace-nowrap">{formatPeriod(inv.periodStart, inv.periodEnd)}</DataCell>
                  <DataCell align="center">
                    <Badge variant="outline" className={cn("text-xs", statusCfg.color)}>{statusCfg.label}</Badge>
                  </DataCell>
                  <DataCell className="text-foreground whitespace-nowrap">{formatDate(inv.dueDate)}</DataCell>
                  <DataCell className="text-foreground whitespace-nowrap">{formatDate(inv.paidAt)}</DataCell>
                  <DataCell align="right">
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Действия" disabled={isBusy}>
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                            <a href={`/api/admin/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3.5 w-3.5" />Открыть счёт (PDF)
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                            <a href={`/api/admin/invoices/${inv.id}/act`} target="_blank" rel="noopener noreferrer">
                              <FileCheck2 className="h-3.5 w-3.5" />Открыть акт
                            </a>
                          </DropdownMenuItem>
                          {!isFinal && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setStatus(inv, "paid")}>
                                <CheckCircle2 className="h-3.5 w-3.5" />Отметить оплаченным
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => setStatus(inv, "cancelled")}
                              >
                                <XCircle className="h-3.5 w-3.5" />Аннулировать
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
        emptyText="Нет счетов"
      />
    </>
  )
}
