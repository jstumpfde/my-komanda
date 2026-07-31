/**
 * /ai-rop/clients — «Клиенты 360»: список заказчиков, сгруппированных по
 * нормализованному телефону (один телефон = один профиль). Метрики за весь
 * период + счётчик оборванных нитей. Клик по строке → карточка клиента.
 *
 * Доступ: owner/admin/director/department_head/rop_view_team видят всех
 * заказчиков компании; обычный менеджер — только тех, с кем сам работал
 * (bitrixManagerId из rop_managers). Не привязанный менеджер видит заглушку
 * «нет доступа» (без редиректа).
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { Users, AlertTriangle, Search } from "lucide-react"
import { auth } from "@/auth"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { listClients } from "@/lib/ai-rop/clients"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { SentimentMini, formatRelative } from "./_ui"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

export default async function ClientsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  const companyId = user.companyId
  const isTeamViewer = ropCanViewTeam(user)
  const scopedManagerId = isTeamViewer ? null : await ropManagerScope({ id: user.id, companyId })
  const noAccess = !isTeamViewer && !scopedManagerId

  const sp = await searchParams
  const q = sp.q?.trim() || ""

  const clients = noAccess
    ? []
    : await listClients({ tenantId: companyId, managerId: scopedManagerId, search: q || undefined, limit: 100 })

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
                <h1 className="text-lg font-semibold">Клиенты</h1>
              </div>
              {!noAccess && (
                <div className="text-sm text-muted-foreground">
                  Найдено: <span className="font-medium text-foreground">{clients.length}</span>
                  {clients.length === 100 ? " (топ 100)" : ""}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
              Все заказчики, с которыми велась коммуникация — звонки, чаты, email, встречи в единой
              картине. Клик по телефону открывает полную историю по клиенту.
            </p>

            {noAccess ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Нет доступа к клиентам — вы не привязаны как менеджер.
                </CardContent>
              </Card>
            ) : (
              <>
                <form method="GET" className="flex items-center gap-2 mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      name="q"
                      defaultValue={q}
                      placeholder="Поиск по телефону, имени, менеджеру…"
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Найти
                  </Button>
                  {q && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/ai-rop/clients">Сбросить</Link>
                    </Button>
                  )}
                </form>

                {clients.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      Пока нет данных — звонки и чаты ещё не разобраны
                      {q ? " или ничего не найдено по запросу" : ""}.
                    </CardContent>
                  </Card>
                ) : (
                  <TableCard>
                    <DataTable>
                      <DataHead>
                        <DataHeadCell>Телефон</DataHeadCell>
                        <DataHeadCell>Имя</DataHeadCell>
                        <DataHeadCell align="center">Касаний</DataHeadCell>
                        <DataHeadCell>Последний контакт</DataHeadCell>
                        <DataHeadCell align="center">Настроение</DataHeadCell>
                        <DataHeadCell align="center">Оборванные нити</DataHeadCell>
                      </DataHead>
                      <tbody>
                        {clients.map((c) => (
                          <DataRow key={c.phone}>
                            <DataCell>
                              <Link href={`/ai-rop/clients/${c.phone}`} className="font-medium text-primary hover:underline">
                                {c.display_phone}
                              </Link>
                            </DataCell>
                            <DataCell className="text-muted-foreground">{c.name || "—"}</DataCell>
                            <DataCell align="center" className="font-medium">
                              {c.total_count}
                            </DataCell>
                            <DataCell className="text-muted-foreground">{formatRelative(c.last_at)}</DataCell>
                            <DataCell align="center">
                              <SentimentMini positive={c.positive} neutral={c.neutral} negative={c.negative} />
                            </DataCell>
                            <DataCell align="center">
                              {c.loose_threads > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
                                >
                                  <AlertTriangle className="size-3" />
                                  {c.loose_threads}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </DataCell>
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
