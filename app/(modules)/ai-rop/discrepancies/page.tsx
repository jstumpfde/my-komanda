/**
 * /ai-rop/discrepancies — инбокс расхождений карточки CRM vs транскрипт
 * (rop_discrepancies). Командная страница: видят руководители/РОП
 * (ropCanViewTeam); обычный менеджер редиректится на свою ленту /ai-rop/my
 * (а НЕ на /ai-rop, как остальные командные страницы модуля) — расхождения
 * по чужим звонкам менеджеру видеть незачем.
 *
 * «Принять»/«Отклонить» — POST /api/modules/ai-rop/discrepancies/[id]/resolve
 * (эндпоинт другого агента, вызывается по контракту из ResolveButtons).
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { and, desc, eq } from "drizzle-orm"
import { GitCompare } from "lucide-react"
import { auth } from "@/auth"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { db } from "@/lib/db"
import { ropDiscrepancies, ropCalls, ropManagers, users } from "@/lib/db/schema"
import { normalizePhone } from "@/lib/ai-rop/pii-mask"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/app/(modules)/ai-rop/_components/format"
import { DiscrepancyFilters, ResolveButtons } from "./_client"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

// Статусы — как их фактически пишет роут resolve: pending → accepted | rejected.
type StatusParam = "pending" | "accepted" | "rejected" | "all"
type SeverityParam = "low" | "medium" | "high"

const SEVERITY_LABEL: Record<string, string> = { low: "Низкая", medium: "Средняя", high: "Высокая" }

function SeverityBadge({ value }: { value: string }) {
  if (value === "high") {
    return (
      <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
        {SEVERITY_LABEL[value] ?? value}
      </Badge>
    )
  }
  if (value === "medium") {
    return (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        {SEVERITY_LABEL[value] ?? value}
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-muted-foreground">{SEVERITY_LABEL[value] ?? value}</Badge>
}

function ResolvedBadge({ status }: { status: string }) {
  if (status === "accepted") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        Принято
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-muted-foreground">Отклонено</Badge>
}

export default async function DiscrepanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; managerId?: string }>
}) {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  const companyId = user.companyId as string
  if (!ropCanViewTeam(user)) redirect("/ai-rop/my")

  const sp = await searchParams
  const statusParam = (sp.status as StatusParam | undefined) ?? "pending"
  const status = statusParam === "all" ? undefined : statusParam
  const severity = (sp.severity as SeverityParam | undefined) || undefined
  const managerId = sp.managerId || undefined

  const conditions = [eq(ropDiscrepancies.tenantId, companyId)]
  if (status) conditions.push(eq(ropDiscrepancies.status, status))
  if (severity) conditions.push(eq(ropDiscrepancies.severity, severity))
  if (managerId) conditions.push(eq(ropCalls.managerId, managerId))

  const rows = await db
    .select({
      discrepancy: ropDiscrepancies,
      callStartedAt: ropCalls.startedAt,
      managerName: ropCalls.managerName,
      callManagerId: ropCalls.managerId,
      clientPhone: ropCalls.clientPhone,
      resolvedByName: users.name,
    })
    .from(ropDiscrepancies)
    .innerJoin(ropCalls, eq(ropCalls.id, ropDiscrepancies.callId))
    .leftJoin(users, eq(users.id, ropDiscrepancies.resolvedByUserId))
    .where(and(...conditions))
    .orderBy(desc(ropDiscrepancies.createdAt))
    .limit(200)

  const managerRows = await db
    .select({ id: ropManagers.bitrixManagerId, name: ropManagers.name })
    .from(ropManagers)
    .where(eq(ropManagers.tenantId, companyId))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <TrialBanner />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Расхождения с CRM</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                Найдено: <span className="font-medium text-foreground">{rows.length}</span>
                {rows.length === 200 ? " (топ 200)" : ""}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
              AI сверяет карточку сделки/лида в Bitrix с тем, что реально прозвучало в разговоре.
              Здесь — расхождения, которые стоит проверить и, при необходимости, поправить в CRM.
            </p>

            <DiscrepancyFilters
              managers={managerRows}
              status={statusParam}
              severity={severity ?? ""}
              managerId={managerId ?? ""}
            />

            {rows.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Нет расхождений по выбранным фильтрам.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {rows.map((r) => {
                  const d = r.discrepancy
                  const phone = r.clientPhone ? normalizePhone(r.clientPhone) : null
                  return (
                    <Card key={d.id}>
                      <CardContent className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">{r.managerName || (r.callManagerId ? `ID ${r.callManagerId}` : "Менеджер не определён")}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{formatDateTime(r.callStartedAt)}</span>
                            {phone && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <Link href={`/ai-rop/clients/${phone}`} className="text-primary hover:underline">
                                  {r.clientPhone}
                                </Link>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <SeverityBadge value={d.severity} />
                            {d.status !== "pending" && <ResolvedBadge status={d.status} />}
                          </div>
                        </div>

                        <div className="text-xs font-medium text-muted-foreground mb-1.5">
                          {d.fieldLabel || d.fieldName}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                          <span className="text-muted-foreground line-through">{d.cardValue || "—"}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium">{d.suggestedValue || "—"}</span>
                        </div>

                        {d.transcriptEvidence && (
                          <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground italic mb-3">
                            «{d.transcriptEvidence}»
                          </blockquote>
                        )}

                        {d.status === "pending" ? (
                          <div className="flex flex-col gap-1.5 pt-1">
                            <ResolveButtons id={d.id} />
                            <p className="text-xs text-muted-foreground">
                              «Принять» помечает расхождение учтённым; фактическая запись в Bitrix
                              произойдёт автоматически только если в компании включён автоматический
                              режим применения — иначе внесите изменение в CRM вручную.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {d.status === "accepted" ? "Принято" : "Отклонено"} {formatDateTime(d.resolvedAt)}
                            {r.resolvedByName ? ` · ${r.resolvedByName}` : ""}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
