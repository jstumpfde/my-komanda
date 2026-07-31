/**
 * /ai-rop/leaderboard — «Лидерборд» команды за 30 дней (реальные имена —
 * страница защищена ropCanViewTeam, анонимизация нужна только на персональной
 * /ai-rop/my у рядового менеджера). Доступ: см. _components/rop-guard.ts.
 */
import { Trophy } from "lucide-react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { requireRopTeamViewer } from "@/app/(modules)/ai-rop/_components/rop-guard"
import { getLeaderboard } from "@/lib/ai-rop/gamification"
import { RankBadge, scoreColorClass } from "./_ui"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

export default async function LeaderboardPage() {
  const viewer = await requireRopTeamViewer()

  const leaders = await getLeaderboard({ tenantId: viewer.companyId, daysBack: 30 }) // НЕ anonymize — реальные имена (гейт ropCanViewTeam)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <TrialBanner />
            <div className="flex items-center gap-2 pt-3 pb-2">
              <Trophy className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Лидерборд</h1>
            </div>
            <p className="text-sm text-muted-foreground pb-6">
              За последние 30 дней. Рейтинг = средняя оценка × 10 + кол-во звонков + доля позитива × 20. Минимум 3
              завершённых звонка, чтобы попасть в таблицу.
            </p>

            {leaders.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Пока нет данных за 30 дней (минимум 3 звонка на менеджера).
                </CardContent>
              </Card>
            ) : (
              <TableCard>
                <DataTable>
                  <DataHead>
                    <DataHeadCell width="64px">Место</DataHeadCell>
                    <DataHeadCell>Менеджер</DataHeadCell>
                    <DataHeadCell align="right" width="100px">Звонков</DataHeadCell>
                    <DataHeadCell align="right" width="110px">Ср. оценка</DataHeadCell>
                    <DataHeadCell align="right" width="100px">Чек-лист</DataHeadCell>
                    <DataHeadCell align="right" width="110px">Позитив</DataHeadCell>
                    <DataHeadCell align="right" width="110px">Рейтинг</DataHeadCell>
                  </DataHead>
                  <tbody>
                    {leaders.map((l) => (
                      <DataRow key={l.manager_id}>
                        <DataCell>
                          <RankBadge rank={l.rank} />
                        </DataCell>
                        <DataCell className="font-medium">{l.manager_name}</DataCell>
                        <DataCell align="right">{l.done_count}</DataCell>
                        <DataCell align="right">
                          <span className={`font-semibold ${scoreColorClass(l.avg_score)}`}>
                            {l.avg_score != null ? l.avg_score.toFixed(1) : "—"}
                          </span>
                        </DataCell>
                        <DataCell align="right" className="text-muted-foreground">
                          {l.avg_compliance != null ? `${Math.round(l.avg_compliance * 100)}%` : "—"}
                        </DataCell>
                        <DataCell align="right" className="text-muted-foreground">
                          {Math.round(l.positive_share * 100)}%
                        </DataCell>
                        <DataCell align="right">
                          <span className="font-bold text-violet-600">{l.score.toFixed(1)}</span>
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
