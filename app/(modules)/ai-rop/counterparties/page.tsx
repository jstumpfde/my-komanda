/**
 * /ai-rop/counterparties — список контрагентов компании (клиенты/поставщики/
 * партнёры), каждый со своими каналами и числом сделок-нитей. Клик — карточка
 * с единой лентой всех касаний по всем каналам.
 *
 * Доступ: командный экран, requireRopTeamViewer (см. /ai-rop/attention).
 */
import Link from "next/link"
import { Radio, Users } from "lucide-react"
import { listCounterparties } from "@/lib/salesradar/counterparties-feed"
import { hasAnyConnector } from "@/lib/salesradar/deals-feed"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { requireRopTeamViewer } from "../_components/rop-guard"
import { CounterpartyKindBadge, ChannelBadges, formatRelative } from "./_ui"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>
}) {
  const viewer = await requireRopTeamViewer()
  const sp = await searchParams
  const q = sp.q?.trim() || ""

  const [counterparties, connected] = await Promise.all([
    listCounterparties({ companyId: viewer.companyId, search: q || undefined, kind: sp.kind, limit: 200 }),
    hasAnyConnector(viewer.companyId),
  ])

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
                <Users className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Контрагенты</h1>
              </div>
              {connected && (
                <div className="text-sm text-muted-foreground">
                  Найдено: <span className="font-medium text-foreground">{counterparties.length}</span>
                </div>
              )}
            </div>
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
              Клиенты, поставщики и партнёры, с которыми была коммуникация в подключённых каналах — почта,
              Telegram, WhatsApp, звонки. Клик открывает единую ленту всех касаний.
            </p>

            {!connected ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Radio className="size-6 text-muted-foreground" />
                  <div className="text-sm font-medium">Пока нет контрагентов — подключите канал в разделе «Каналы»</div>
                  <Button asChild size="sm" className="mt-1">
                    <Link href="/ai-rop/connectors">Перейти в «Каналы»</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <form method="GET" className="mb-4 flex items-center gap-2">
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder="Поиск по имени, телефону…"
                    className="h-9 max-w-sm text-sm"
                  />
                  <Button type="submit" size="sm" variant="outline">Найти</Button>
                  {q && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/ai-rop/counterparties">Сбросить</Link>
                    </Button>
                  )}
                </form>

                {counterparties.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      {q ? "Ничего не найдено по запросу." : "Пока нет данных — сообщения ещё не разобраны."}
                    </CardContent>
                  </Card>
                ) : (
                  <TableCard>
                    <DataTable>
                      <DataHead>
                        <DataHeadCell>Контрагент</DataHeadCell>
                        <DataHeadCell align="center">Тип</DataHeadCell>
                        <DataHeadCell>Каналы</DataHeadCell>
                        <DataHeadCell align="center">Сделок</DataHeadCell>
                        <DataHeadCell>Последняя активность</DataHeadCell>
                      </DataHead>
                      <tbody>
                        {counterparties.map((c) => (
                          <DataRow key={c.id}>
                            <DataCell>
                              <Link href={`/ai-rop/counterparties/${c.id}`} className="font-medium text-primary hover:underline">
                                {c.name || "Без имени"}
                              </Link>
                            </DataCell>
                            <DataCell align="center">
                              <CounterpartyKindBadge kind={c.kind} />
                            </DataCell>
                            <DataCell>
                              <ChannelBadges channels={c.channels} />
                            </DataCell>
                            <DataCell align="center" className="font-medium">{c.dealCount}</DataCell>
                            <DataCell className="text-muted-foreground">{formatRelative(c.lastActivityAt)}</DataCell>
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
