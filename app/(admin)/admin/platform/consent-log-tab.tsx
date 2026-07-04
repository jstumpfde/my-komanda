"use client"

// Журнал согласий 152-ФЗ (cookie-баннер, согласие на обработку ПДн,
// согласие на рекламную рассылку). Читает /api/platform/consent-log
// (GET, session-гейт по PLATFORM_ADMIN_EMAILS — как остальные /admin/platform).

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { RefreshCw, Loader2 } from "lucide-react"

interface ConsentRow {
  id: string
  userId: string | null
  userEmail: string | null
  visitorId: string | null
  consentType: string
  action: string
  documentVersion: string
  details: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}
interface Summary {
  total: number
  cookieCount: number
  privacyCount: number
  marketingCount: number
  acceptedCount: number
  rejectedCount: number
}
interface ApiResponse {
  rows: ConsentRow[]
  total: number
  page: number
  pageSize: number
  summary: Summary
}

const TYPE_LABEL: Record<string, string> = {
  cookie: "Cookie",
  privacy_policy: "Обработка ПДн",
  marketing: "Рекламная рассылка",
}
const ACTION_BADGE: Record<string, string> = {
  accepted: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  rejected: "bg-red-500/10 text-red-700 border-red-200",
  partial:  "bg-amber-500/10 text-amber-700 border-amber-200",
}
const ACTION_LABEL: Record<string, string> = {
  accepted: "Принято",
  rejected: "Отклонено",
  partial: "Частично",
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

export function ConsentLogTab() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (typeFilter !== "all") params.set("consentType", typeFilter)
      const res = await fetch(`/api/platform/consent-log?${params.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter])

  useEffect(() => { load() }, [load])

  const summary = data?.summary

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{summary?.total ?? "—"}</div><div className="text-xs text-muted-foreground mt-1">Всего записей</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{summary?.cookieCount ?? "—"}</div><div className="text-xs text-muted-foreground mt-1">Cookie</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{summary?.privacyCount ?? "—"}</div><div className="text-xs text-muted-foreground mt-1">Обработка ПДн</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{summary?.marketingCount ?? "—"}</div><div className="text-xs text-muted-foreground mt-1">Рассылка</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold text-emerald-700">{summary?.acceptedCount ?? "—"}</div><div className="text-xs text-muted-foreground mt-1">Принято ({summary?.rejectedCount ?? 0} отклонено)</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Журнал согласий (152-ФЗ)</CardTitle>
            <CardDescription>Кто/когда/что принял, версия документа на момент согласия</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Тип согласия" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="cookie">Cookie</SelectItem>
                <SelectItem value="privacy_policy">Обработка ПДн</SelectItem>
                <SelectItem value="marketing">Рекламная рассылка</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TableCard>
            <DataTable>
              <DataHead>
                <DataHeadCell>Время</DataHeadCell>
                <DataHeadCell>Тип</DataHeadCell>
                <DataHeadCell>Действие</DataHeadCell>
                <DataHeadCell>Версия документа</DataHeadCell>
                <DataHeadCell>Кто</DataHeadCell>
                <DataHeadCell>IP</DataHeadCell>
                <DataHeadCell>Детали</DataHeadCell>
              </DataHead>
              <tbody>
                {(data?.rows ?? []).map(r => (
                  <DataRow key={r.id}>
                    <DataCell className="text-xs whitespace-nowrap">{fmtDate(r.createdAt)}</DataCell>
                    <DataCell><Badge variant="outline">{TYPE_LABEL[r.consentType] ?? r.consentType}</Badge></DataCell>
                    <DataCell><Badge variant="outline" className={ACTION_BADGE[r.action]}>{ACTION_LABEL[r.action] ?? r.action}</Badge></DataCell>
                    <DataCell className="text-xs font-mono">{r.documentVersion}</DataCell>
                    <DataCell className="text-xs">
                      {r.userEmail ?? (r.visitorId ? <span className="text-muted-foreground">аноним · {r.visitorId.slice(0, 8)}…</span> : <span className="text-muted-foreground">—</span>)}
                    </DataCell>
                    <DataCell className="text-xs font-mono">{r.ipAddress ?? "—"}</DataCell>
                    <DataCell className="text-xs font-mono max-w-[240px] truncate" title={r.details ? JSON.stringify(r.details) : undefined}>
                      {r.details ? JSON.stringify(r.details) : "—"}
                    </DataCell>
                  </DataRow>
                ))}
                {data && data.rows.length === 0 && (
                  <DataRow><DataCell colSpan={7} className="text-center text-muted-foreground">Записей пока нет</DataCell></DataRow>
                )}
              </tbody>
            </DataTable>
          </TableCard>

          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
              <span>Страница {data.page} из {Math.ceil(data.total / data.pageSize)} · всего {data.total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / data.pageSize)} onClick={() => setPage(p => p + 1)}>Вперёд</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
