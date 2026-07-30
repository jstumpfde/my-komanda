/**
 * /ai-rop/crm-log — журнал записей в Bitrix CRM (rop_crm_write_log).
 * «Бумажный след»: что и куда было отправлено (или симулировано в
 * dry-run), с раскрывающимся сырым payload/result. Командная страница —
 * гейт ropCanViewTeam, редирект на /ai-rop как у остальных.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { History } from "lucide-react"
import { auth } from "@/auth"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { listCrmLog } from "@/lib/ai-rop/crm-log"
import type { CrmMode } from "@/lib/ai-rop/types"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { formatDateTime } from "@/app/(modules)/ai-rop/_components/format"
import { ModeBadge, CrmStatusBadge, actionLabel, entityLabel } from "./_ui"
import { ModeFilter } from "./_client"

export const dynamic = "force-dynamic"

function isCrmMode(v: string | undefined): v is CrmMode {
  return v === "dry" || v === "live"
}

export default async function CrmLogPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  const companyId = user.companyId as string
  if (!ropCanViewTeam(user)) redirect("/ai-rop")

  const sp = await searchParams
  const mode = isCrmMode(sp.mode) ? sp.mode : undefined

  const logs = await listCrmLog({ companyId, mode, limit: 150 })

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Журнал записей в CRM</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                Найдено: <span className="font-medium text-foreground">{logs.length}</span>
                {logs.length === 150 ? " (топ 150)" : ""}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
              Каждая запись в Bitrix (комментарий, задача, обновление активности) оставляет здесь
              строку — доказательство, что и когда было отправлено (или только смоделировано в
              тестовом режиме).
            </p>

            <ModeFilter mode={mode ?? "all"} />

            {logs.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Журнал пуст.
                </CardContent>
              </Card>
            ) : (
              <TableCard>
                <DataTable>
                  <DataHead>
                    <DataHeadCell width="150px">Дата</DataHeadCell>
                    <DataHeadCell>Действие</DataHeadCell>
                    <DataHeadCell>Сущность</DataHeadCell>
                    <DataHeadCell width="120px">Режим</DataHeadCell>
                    <DataHeadCell width="120px">Статус</DataHeadCell>
                    <DataHeadCell width="90px">Звонок</DataHeadCell>
                    <DataHeadCell>Payload</DataHeadCell>
                  </DataHead>
                  <tbody>
                    {logs.map((r) => (
                      <DataRow key={r.id}>
                        <DataCell className="text-muted-foreground whitespace-nowrap">{formatDateTime(r.createdAt)}</DataCell>
                        <DataCell>{actionLabel(r.action)}</DataCell>
                        <DataCell className="text-muted-foreground">{entityLabel(r.entityType, r.entityId)}</DataCell>
                        <DataCell><ModeBadge value={r.mode} /></DataCell>
                        <DataCell><CrmStatusBadge value={r.status} /></DataCell>
                        <DataCell>
                          <Link href={`/ai-rop/calls/${r.callId}`} className="text-primary hover:underline">
                            Открыть
                          </Link>
                        </DataCell>
                        <DataCell>
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Показать payload</Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-2 max-h-64 max-w-lg overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] whitespace-pre-wrap break-words">
                                {JSON.stringify(r.payloadJson, null, 2)}
                                {r.resultJson ? `\n\n--- result ---\n${JSON.stringify(r.resultJson, null, 2)}` : ""}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        </DataCell>
                      </DataRow>
                    ))}
                  </tbody>
                </DataTable>
              </TableCard>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
