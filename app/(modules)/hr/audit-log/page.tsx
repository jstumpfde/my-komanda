"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShieldCheck, Download, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth"

// ФЗ-152: страница просмотра журнала аудита операций с ПДн кандидатов.
// Данные из GET /api/modules/hr/audit-log (доступ — админ/директор тенанта).

interface AuditEntry {
  id: string
  userEmail: string | null
  action: string
  entityType: string | null
  entityId: string | null
  count: number | null
  meta: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, { label: string; icon: typeof Download; cls: string }> = {
  candidate_export: { label: "Экспорт кандидатов", icon: Download, cls: "bg-blue-500/10 text-blue-700 border-blue-200" },
  candidate_delete: { label: "Удаление кандидатов", icon: Trash2, cls: "bg-red-500/10 text-red-700 border-red-200" },
}

function fmtDate(s: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(s))
  } catch { return s }
}

export default function AuditLogPage() {
  const { hasAccess } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [action, setAction] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (action !== "all") params.set("action", action)
      const res = await fetch(`/api/modules/hr/audit-log?${params}`)
      if (res.status === 403) { setForbidden(true); setEntries([]); return }
      if (!res.ok) { setEntries([]); return }
      const json = await res.json()
      setEntries((json.data ?? json).entries ?? [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [action])

  useEffect(() => { void load() }, [load])

  if (!hasAccess(["platform_admin", "admin", "director", "client", "hr_lead"])) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="text-lg font-semibold mb-2">Доступ ограничен</h1>
        <p className="text-sm text-muted-foreground">У вас нет доступа к этому разделу.</p>
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                  <ShieldCheck className="size-5 text-violet-600" />Журнал аудита
                </h1>
                <p className="text-sm text-muted-foreground">
                  ФЗ-152: операции с персональными данными кандидатов (экспорт, удаление). Кто, когда, сколько записей.
                </p>
              </div>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все события</SelectItem>
                  <SelectItem value="candidate_export">Экспорт кандидатов</SelectItem>
                  <SelectItem value="candidate_delete">Удаление кандидатов</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {forbidden ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-sm text-muted-foreground">
                Журнал аудита доступен только администратору и директору компании.
              </div>
            ) : (
              <TableCard>
                <DataTable>
                  <DataHead>
                    <DataHeadCell>Дата</DataHeadCell>
                    <DataHeadCell>Пользователь</DataHeadCell>
                    <DataHeadCell>Действие</DataHeadCell>
                    <DataHeadCell align="right">Записей</DataHeadCell>
                    <DataHeadCell>Контекст</DataHeadCell>
                    <DataHeadCell>IP</DataHeadCell>
                  </DataHead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Загрузка…</td></tr>
                    ) : entries.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Событий пока нет</td></tr>
                    ) : (
                      entries.map((e) => {
                        const cfg = ACTION_LABELS[e.action]
                        const Icon = cfg?.icon
                        const kind = e.meta && typeof e.meta.kind === "string" ? e.meta.kind : null
                        const scope = e.meta && typeof e.meta.scope === "string" ? e.meta.scope : null
                        return (
                          <DataRow key={e.id}>
                            <DataCell className="whitespace-nowrap text-muted-foreground">{fmtDate(e.createdAt)}</DataCell>
                            <DataCell className="font-medium">{e.userEmail ?? "—"}</DataCell>
                            <DataCell>
                              {cfg ? (
                                <Badge variant="outline" className={cfg.cls}>
                                  {Icon && <Icon className="size-3 mr-1" />}{cfg.label}
                                </Badge>
                              ) : e.action}
                            </DataCell>
                            <DataCell align="right" className="tabular-nums">{e.count ?? "—"}</DataCell>
                            <DataCell className="text-muted-foreground text-xs">
                              {[scope && `охват: ${scope}`, kind && `тип: ${kind}`].filter(Boolean).join(" · ") || "—"}
                            </DataCell>
                            <DataCell className="text-muted-foreground font-mono text-xs">{e.ip ?? "—"}</DataCell>
                          </DataRow>
                        )
                      })
                    )}
                  </tbody>
                </DataTable>
              </TableCard>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
