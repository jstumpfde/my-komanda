/**
 * /ai-rop/deals — «Сделки»: список сделок-нитей компании. Главная ценность
 * SalesRadar Ф1 — показать, что в одном чате обсуждали несколько сделок,
 * а не одну: система их разъединила по нитям (rop_deal_threads).
 *
 * Доступ: командный экран, requireRopTeamViewer (директор/head/rop_view_team) —
 * по образцу /ai-rop/attention. Изоляция тенанта — companyId из сессии
 * (requireRopTeamViewer), никогда из query.
 */
import Link from "next/link"
import { Radio, Workflow } from "lucide-react"
import { listDealThreads, hasAnyConnector } from "@/lib/salesradar/deals-feed"
import { listCounterparties } from "@/lib/salesradar/counterparties-feed"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { requireRopTeamViewer } from "../_components/rop-guard"
import { DealsFilters } from "./_filters"
import { ShadowBadge, DealStatusBadge, ChannelBadges, formatMoney, formatRelative } from "./_ui"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; counterparty_id?: string; channel?: string; shadow?: string }>
}) {
  const viewer = await requireRopTeamViewer()
  const sp = await searchParams

  const [deals, counterparties, connected] = await Promise.all([
    listDealThreads({
      companyId: viewer.companyId,
      status: sp.status,
      counterpartyId: sp.counterparty_id,
      channel: sp.channel,
      shadowOnly: sp.shadow === "1",
    }),
    listCounterparties({ companyId: viewer.companyId, limit: 500 }),
    hasAnyConnector(viewer.companyId),
  ])

  const availableChannels = Array.from(new Set(counterparties.flatMap((c) => c.channels))).sort()

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
                <Workflow className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Сделки</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                Найдено: <span className="font-medium text-foreground">{deals.length}</span>
              </div>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
              Переписка и звонки разложены по сделкам-нитям — даже если в одном чате обсуждали сразу несколько
              заказов. Нити из CRM помечены отдельно от «теневых» — тех, что система собрала сама, пока сделки
              ещё нет в CRM.
            </p>

            {!connected ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Radio className="size-6 text-muted-foreground" />
                  <div className="text-sm font-medium">Пока нет сделок — подключите канал в разделе «Каналы»</div>
                  <div className="max-w-sm text-sm text-muted-foreground">
                    Почта, Telegram или WhatsApp — как только сообщения начнут поступать, здесь появятся
                    сделки-нити.
                  </div>
                  <Button asChild size="sm" className="mt-1">
                    <Link href="/ai-rop/connectors">Перейти в «Каналы»</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <DealsFilters
                  counterparties={counterparties.map((c) => ({ id: c.id, name: c.name || "Без имени" }))}
                  channels={availableChannels}
                />

                {deals.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      По текущим фильтрам сделок не найдено.
                    </CardContent>
                  </Card>
                ) : (
                  <TableCard>
                    <DataTable>
                      <DataHead>
                        <DataHeadCell>Сделка</DataHeadCell>
                        <DataHeadCell>Контрагент</DataHeadCell>
                        <DataHeadCell>Канал</DataHeadCell>
                        <DataHeadCell align="right">Сумма</DataHeadCell>
                        <DataHeadCell>Стадия</DataHeadCell>
                        <DataHeadCell align="center">Статус</DataHeadCell>
                        <DataHeadCell align="center">Сообщ.</DataHeadCell>
                        <DataHeadCell align="center">Уверенность</DataHeadCell>
                        <DataHeadCell>Последнее касание</DataHeadCell>
                      </DataHead>
                      <tbody>
                        {deals.map((d) => (
                          <DataRow key={d.id}>
                            <DataCell>
                              <Link href={`/ai-rop/deals/${d.id}`} className="font-medium text-primary hover:underline">
                                {d.title || "Без названия"}
                              </Link>
                              {d.kind === "shadow" && (
                                <div className="mt-1">
                                  <ShadowBadge />
                                </div>
                              )}
                            </DataCell>
                            <DataCell className="text-muted-foreground">
                              {d.counterpartyId ? (
                                <Link href={`/ai-rop/counterparties/${d.counterpartyId}`} className="hover:underline">
                                  {d.counterpartyName || "Без имени"}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </DataCell>
                            <DataCell>
                              <ChannelBadges channels={d.channels} />
                            </DataCell>
                            <DataCell align="right" className="whitespace-nowrap font-medium">
                              {formatMoney(d.amount, d.currency)}
                            </DataCell>
                            <DataCell className="text-muted-foreground">{d.stage || "—"}</DataCell>
                            <DataCell align="center">
                              <DealStatusBadge status={d.status} />
                            </DataCell>
                            <DataCell align="center" className="font-medium">{d.messageCount}</DataCell>
                            <DataCell align="center" className="text-muted-foreground">
                              {Math.round(d.confidence * 100)}%
                            </DataCell>
                            <DataCell className="text-muted-foreground">{formatRelative(d.lastActivityAt)}</DataCell>
                          </DataRow>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableCard>
                )}
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
