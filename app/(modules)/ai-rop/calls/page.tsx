// Список звонков/взаимодействий AI-РОП. Server component — читает
// rop_calls/rop_analyses напрямую (RLS через lib/ai-rop/rls.ts), как в
// оригинале call-agent. Видимость: директор/head/rop_view_team — вся
// компания; обычный менеджер — только свои (RopScope.bitrixManagerId).
import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"
import { ArrowDownLeft, ArrowUpRight, Phone, MessageSquare, Mail, Video, PhoneCall } from "lucide-react"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls } from "@/lib/db/schema"
import { ropCallsScope, type RopScope } from "@/lib/ai-rop/rls"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { requireRopViewer } from "../_components/rop-guard"
import { CallsFilters } from "./CallsFilters"
import { SummaryCell } from "./SummaryCell"
import { SentimentBadge, CallStatusBadge } from "../_components/badges"
import { formatDateTime, formatDuration } from "../_components/format"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

function TypeIcon({ type }: { type: string | null }) {
  const t = type || "call"
  if (t === "chat") return <MessageSquare className="size-3.5 text-emerald-500" />
  if (t === "email") return <Mail className="size-3.5 text-violet-600" />
  if (t === "meeting") return <Video className="size-3.5 text-amber-500" />
  return <Phone className="size-3.5 text-muted-foreground" />
}

export default async function CallsListPage(props: {
  searchParams: Promise<{
    status?: string; sentiment?: string; q?: string; from?: string; to?: string
    type?: string; manager_id?: string
  }>
}) {
  const viewer = await requireRopViewer()
  const sp = await props.searchParams

  const scope: RopScope = {
    companyId: viewer.companyId,
    isTeamViewer: viewer.isTeamViewer,
    bitrixManagerId: viewer.bitrixManagerId,
  }

  const where = [ropCallsScope(scope)]
  if (sp.status) where.push(eq(ropCalls.status, sp.status))
  if (sp.type) where.push(eq(ropCalls.type, sp.type))
  if (sp.sentiment) where.push(eq(ropAnalyses.sentiment, sp.sentiment))
  if (viewer.isTeamViewer && sp.manager_id) where.push(eq(ropCalls.managerId, sp.manager_id))
  if (sp.from) where.push(sql`substr(${ropCalls.startedAt}::text, 1, 10) >= ${sp.from}`)
  if (sp.to) where.push(sql`substr(${ropCalls.startedAt}::text, 1, 10) <= ${sp.to}`)
  if (sp.q?.trim()) {
    where.push(sql`${ropCalls.id} IN (SELECT call_id FROM rop_transcripts WHERE text ILIKE ${"%" + sp.q.trim() + "%"})`)
  }
  const whereClause = and(...where)

  const managersList = viewer.isTeamViewer
    ? await db.execute(sql`
        SELECT c.manager_id AS id, COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
        FROM rop_calls c
        LEFT JOIN rop_managers m ON m.tenant_id = c.tenant_id AND m.bitrix_manager_id = c.manager_id
        WHERE c.tenant_id = ${viewer.companyId}::uuid
          AND c.manager_id IS NOT NULL AND c.manager_id <> ''
          AND (m.is_active IS NULL OR m.is_active = true)
        GROUP BY c.manager_id ORDER BY name
      `) as unknown as Array<{ id: string; name: string }>
    : []

  const [rows, totalRows] = await Promise.all([
    db.select({
      id: ropCalls.id,
      bitrixCallId: ropCalls.bitrixCallId,
      type: ropCalls.type,
      channel: ropCalls.channel,
      managerName: ropCalls.managerName,
      managerId: ropCalls.managerId,
      clientPhone: ropCalls.clientPhone,
      direction: ropCalls.direction,
      startedAt: ropCalls.startedAt,
      durationSec: ropCalls.durationSec,
      status: ropCalls.status,
      summary: ropAnalyses.summary,
      nextAction: ropAnalyses.nextAction,
      sentiment: ropAnalyses.sentiment,
      managerScore: ropAnalyses.managerScore,
    })
      .from(ropCalls)
      .leftJoin(ropAnalyses, eq(ropAnalyses.callId, ropCalls.id))
      .where(whereClause)
      .orderBy(desc(ropCalls.createdAt))
      .limit(200),
    db.select({ n: sql<number>`COUNT(*)::int` })
      .from(ropCalls)
      .leftJoin(ropAnalyses, eq(ropAnalyses.callId, ropCalls.id))
      .where(whereClause),
  ])
  const total = totalRows[0]?.n ?? 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <TrialBanner />
            <div className="mb-3 flex items-center justify-between gap-2 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">{viewer.isManager ? "Мои звонки" : "Звонки"}</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                Найдено: <b className="text-foreground">{total}</b>{rows.length < total ? ` (показаны первые ${rows.length})` : ""}
              </div>
            </div>

            <CallsFilters managers={viewer.isTeamViewer ? managersList : undefined} />

            {rows.length === 0 ? (
              <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
                Нет звонков под текущие фильтры.{" "}
                <Link href="/ai-rop/upload" className="text-violet-600 hover:underline">Загрузить запись</Link>
              </div>
            ) : (
              <DataTable>
                <DataHead>
                  <DataHeadCell width="28px" />
                  <DataHeadCell>Дата</DataHeadCell>
                  <DataHeadCell>Менеджер</DataHeadCell>
                  <DataHeadCell>Заказчик</DataHeadCell>
                  <DataHeadCell align="right">Дл.</DataHeadCell>
                  <DataHeadCell>Настр.</DataHeadCell>
                  <DataHeadCell align="right">Оценка</DataHeadCell>
                  <DataHeadCell width="360px">Итог</DataHeadCell>
                  <DataHeadCell>Статус</DataHeadCell>
                </DataHead>
                <tbody>
                  {rows.map((r) => (
                    <DataRow key={r.id} className="cursor-pointer">
                      <DataCell className="text-center" title={r.type || "call"}><TypeIcon type={r.type} /></DataCell>
                      <DataCell className="whitespace-nowrap">
                        <Link href={`/ai-rop/calls/${r.id}`} className="text-violet-600 hover:underline">{formatDateTime(r.startedAt)}</Link>
                      </DataCell>
                      <DataCell className="font-medium">{r.managerName || (r.managerId ? <span className="text-muted-foreground">ID {r.managerId}</span> : "—")}</DataCell>
                      <DataCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {r.direction === "in" ? <ArrowDownLeft className="size-3.5 text-emerald-500" /> : r.direction === "out" ? <ArrowUpRight className="size-3.5 text-violet-600" /> : null}
                          {r.clientPhone || "—"}
                        </span>
                      </DataCell>
                      <DataCell align="right">{formatDuration(r.durationSec)}</DataCell>
                      <DataCell><SentimentBadge value={r.sentiment} /></DataCell>
                      <DataCell align="right">{r.managerScore != null ? r.managerScore.toFixed(1) : "—"}</DataCell>
                      <DataCell><SummaryCell summary={r.summary} nextAction={r.nextAction} /></DataCell>
                      <DataCell><CallStatusBadge value={r.status} /></DataCell>
                    </DataRow>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
