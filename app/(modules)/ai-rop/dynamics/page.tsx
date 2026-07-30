/**
 * /ai-rop/dynamics — «Динамика по менеджерам»: учится ли менеджер со временем
 * (растёт / застрял / просел выполнение чек-листа). Доступ — ropCanViewTeam
 * (owner/admin/head/rop_view_team). Данные — lib/ai-rop/team-dynamics.ts.
 */
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TrendingUp } from "lucide-react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { getTeamDynamics } from "@/lib/ai-rop/team-dynamics"
import { ManagerCard, formatPeriodStart } from "./_ui"

export const dynamic = "force-dynamic"

const WEEKS = 8

export default async function DynamicsPage() {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  if (!ropCanViewTeam(user)) redirect("/ai-rop")
  const companyId = user.companyId

  const managers = await getTeamDynamics(companyId, WEEKS)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-2">
              <TrendingUp className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Динамика по менеджерам</h1>
            </div>
            <p className="text-sm text-muted-foreground pb-4">
              За {WEEKS} недель: {formatPeriodStart(WEEKS)} → сегодня
            </p>

            {managers.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Пока недостаточно данных (нужно ≥10 звонков на менеджера за период).
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {managers.map((m) => (
                  <ManagerCard key={m.managerId} m={m} />
                ))}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
