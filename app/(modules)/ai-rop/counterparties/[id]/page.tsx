/**
 * /ai-rop/counterparties/[id] — карточка контрагента: единая лента всех
 * касаний по всем каналам (звонки + сообщения, вперемешку по времени) и
 * блок «Разложено по сделкам» — ГЛАВНЫЙ визуальный акцент SalesRadar Ф1:
 * показывает, что один поток переписки разошёлся по N сделкам. Это то, что
 * показываем собственнику как ценность продукта.
 *
 * Доступ: тот же командный гейт, что и список (requireRopTeamViewer).
 * company-scoped — getCounterpartyDetail фильтрует по companyId.
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Users, Workflow, Split } from "lucide-react"
import { getCounterpartyDetail } from "@/lib/salesradar/counterparties-feed"
import { dealStatusLabel } from "@/lib/salesradar/ui-labels"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { requireRopTeamViewer } from "../../_components/rop-guard"
import { CounterpartyKindBadge, touchIcon, formatDateTime } from "../_ui"

export const dynamic = "force-dynamic"

const BAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-500",
]

export default async function CounterpartyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRopTeamViewer()
  const { id } = await params
  const cp = await getCounterpartyDetail(viewer.companyId, id)
  if (!cp) notFound()

  const totalLinked = cp.dealBreakdown.reduce((sum, d) => sum + d.messageCount, 0)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6 space-y-4" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <Link href="/ai-rop/counterparties" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              К списку контрагентов
            </Link>

            <Card>
              <CardContent className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-violet-600" />
                      <h1 className="text-lg font-semibold">{cp.name || "Без имени"}</h1>
                      <CounterpartyKindBadge kind={cp.kind} />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {cp.primaryPhone || "Телефон не определён"}
                      {cp.inn ? ` · ИНН ${cp.inn}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Первое касание: {formatDateTime(cp.firstSeenAt)}</div>
                    <div>Последняя активность: {formatDateTime(cp.lastActivityAt)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {cp.dealBreakdown.length > 0 && (
              <Card className="border-violet-200 dark:border-violet-900/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Split className="size-4 text-violet-600" />
                    Разложено по сделкам
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Единый поток переписки с этим контрагентом система разъединила на {cp.dealBreakdown.length}{" "}
                    {cp.dealBreakdown.length === 1 ? "сделку" : cp.dealBreakdown.length < 5 ? "сделки" : "сделок"} —
                    всего {totalLinked} привязанных сообщений.
                  </p>

                  {totalLinked > 0 && (
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                      {cp.dealBreakdown.map((d, i) => (
                        <div
                          key={d.dealThreadId}
                          className={BAR_COLORS[i % BAR_COLORS.length]}
                          style={{ width: `${(d.messageCount / totalLinked) * 100}%` }}
                          title={`${d.title || "Без названия"} — ${d.messageCount}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {cp.dealBreakdown.map((d, i) => (
                      <Link
                        key={d.dealThreadId}
                        href={`/ai-rop/deals/${d.dealThreadId}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                      >
                        <span className={`size-2.5 shrink-0 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                        <Workflow className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate font-medium text-primary">{d.title || "Без названия"}</span>
                        {d.kind === "shadow" && (
                          <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700 dark:border-violet-900 dark:text-violet-400">
                            теневая
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{dealStatusLabel(d.status)}</Badge>
                        <span className="shrink-0 text-xs text-muted-foreground">{d.messageCount} сообщ.</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Лента касаний ({cp.timeline.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {cp.timeline.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Касаний пока не зафиксировано.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cp.timeline.map((t) => (
                      <div key={`${t.source}-${t.id}`} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          {touchIcon(t.channel)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDateTime(t.at)}</span>
                            {t.dealThreadId && (
                              <Link href={`/ai-rop/deals/${t.dealThreadId}`} className="hover:underline">
                                → {t.dealThreadTitle || "сделка"}
                              </Link>
                            )}
                          </div>
                          <div className="truncate text-sm">{t.text || <span className="text-muted-foreground">(без текста)</span>}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
