/**
 * /ai-rop/deals/[id] — карточка сделки-нити. Шапка + вся лента сообщений
 * ЭТОЙ нити (с каналом и уверенностью привязки у каждого сообщения) + блок
 * «Факты по сделке» (обещано/упущено/можно лучше). Кнопка «Это другая сделка»
 * — заготовка на Ф2 (перепривязка сообщения), в Ф1 просто disabled.
 *
 * Доступ: тот же командный гейт, что и список (requireRopTeamViewer).
 * company-scoped — getDealThreadDetail фильтрует по companyId, чужая сделка
 * даёт notFound(), а не утечку данных другого тенанта.
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Workflow, MessageSquare } from "lucide-react"
import { getDealThreadDetail } from "@/lib/salesradar/deals-feed"
import { connectorKindLabel, dealFactKindLabel, isSoftAiLink } from "@/lib/salesradar/ui-labels"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { requireRopTeamViewer } from "../../_components/rop-guard"
import { ShadowBadge, DealStatusBadge, formatMoney, formatDateTime } from "../_ui"

export const dynamic = "force-dynamic"

const FACT_KIND_STYLE: Record<string, string> = {
  promise: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400",
  missed: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  improvement: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
  risk: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  agreement: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
  requirement: "border-transparent bg-muted text-muted-foreground",
}

export default async function DealThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRopTeamViewer()
  const { id } = await params
  const deal = await getDealThreadDetail(viewer.companyId, id)
  if (!deal) notFound()

  const factsByKind = new Map<string, typeof deal.facts>()
  for (const f of deal.facts) {
    const list = factsByKind.get(f.kind) ?? []
    list.push(f)
    factsByKind.set(f.kind, list)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6 space-y-4" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <Link href="/ai-rop/deals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              К списку сделок
            </Link>

            <Card>
              <CardContent className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Workflow className="size-4 text-violet-600" />
                      <h1 className="text-lg font-semibold">{deal.title || "Без названия"}</h1>
                      {deal.kind === "shadow" && <ShadowBadge />}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {deal.counterparty ? (
                        <Link href={`/ai-rop/counterparties/${deal.counterparty.id}`} className="hover:underline">
                          {deal.counterparty.name || "Без имени"}
                        </Link>
                      ) : (
                        "Контрагент не определён"
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DealStatusBadge status={deal.status} />
                    <div className="text-right">
                      <div className="text-lg font-semibold">{formatMoney(deal.amount, deal.currency)}</div>
                      <div className="text-xs text-muted-foreground">{deal.stage || "Стадия не задана"}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Откуда: {deal.kind === "crm" ? "сделка из CRM" : "собрана автоматически из переписки"}
                    {deal.bitrixDealId ? ` · Bitrix #${deal.bitrixDealId}` : ""}
                  </span>
                  <span>Уверенность нити: {Math.round(deal.confidence * 100)}%</span>
                  <span>Первое касание: {formatDateTime(deal.firstSeenAt)}</span>
                  <span>Последнее касание: {formatDateTime(deal.lastActivityAt)}</span>
                </div>
              </CardContent>
            </Card>

            {deal.facts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Факты по сделке</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[...factsByKind.entries()].map(([kind, facts]) => (
                    <div key={kind}>
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{dealFactKindLabel(kind)}</div>
                      <div className="flex flex-col gap-1.5">
                        {facts.map((f) => (
                          <div key={f.id} className="flex items-start gap-2 text-sm">
                            <Badge variant="outline" className={FACT_KIND_STYLE[kind] ?? ""}>
                              {dealFactKindLabel(kind)}
                            </Badge>
                            <span className="flex-1">{f.text}</span>
                            {f.dueAt && <span className="shrink-0 text-xs text-muted-foreground">до {formatDateTime(f.dueAt)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MessageSquare className="size-4" />
                  Сообщения нити ({deal.messages.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deal.messages.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    В этой нити пока нет привязанных сообщений.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {deal.messages.map((m) => {
                      const soft = isSoftAiLink(m.linkConfidence, m.linkMethod)
                      return (
                        <div
                          key={m.id}
                          className={`rounded-lg border p-3 text-sm ${m.isOurs ? "ml-8 border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20" : "mr-8"}`}
                        >
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{m.authorName || (m.isOurs ? "Мы" : "Контрагент")}</span>
                            <Badge variant="secondary" className="text-[11px] font-normal">
                              {connectorKindLabel(m.connectorKind)}
                            </Badge>
                            <span>{formatDateTime(m.sentAt)}</span>
                            <span className="ml-auto flex items-center gap-1.5">
                              {soft && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="cursor-help border-violet-200 text-[11px] text-violet-700 dark:border-violet-900 dark:text-violet-400"
                                    >
                                      привязано ИИ
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Уверенность привязки {Math.round(m.linkConfidence * 100)}% — стоит перепроверить
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <span>{Math.round(m.linkConfidence * 100)}%</span>
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{m.text || <span className="text-muted-foreground">(без текста)</span>}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end pb-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" disabled>
                      Это другая сделка
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Перепривязка сообщений — скоро</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
