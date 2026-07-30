/**
 * «Мой кабинет» менеджера — единственная страница AI-РОП, доступная рядовому
 * менеджеру (без ropCanViewTeam). Все данные строго скоуплены на его
 * bitrixManagerId / session.user.id — никаких чужих кандидатов/звонков.
 */
import { redirect } from "next/navigation"
import { and, desc, eq, sql } from "drizzle-orm"
import { Flame, UserRound } from "lucide-react"
import { auth } from "@/auth"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { db } from "@/lib/db"
import { ropCalls, ropDiscrepancies } from "@/lib/db/schema"
import { listReminders } from "@/lib/ai-rop/reminders"
import {
  getAchievementsFor,
  getLeaderboard,
  getManagerStreak,
  getWeeklyChallenge,
} from "@/lib/ai-rop/gamification"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { RemindersSection, DiscrepancyInbox } from "./_client"
import {
  AchievementsCard,
  KpiTile,
  LeaderboardCard,
  LooseThreadsCard,
  NotLinkedGate,
  WeeklyChallengeTile,
  type LooseThreadRow,
} from "./_ui"

export const dynamic = "force-dynamic"

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-2">
              <UserRound className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Мой кабинет</h1>
            </div>
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default async function MyRopPage() {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  const companyId = user.companyId as string
  const bitrixManagerId = await ropManagerScope({ id: user.id as string, companyId })

  if (!bitrixManagerId) {
    const base = { role: user.role as string, effectiveRole: (user.effectiveRole as string) ?? null, permissions: (user.permissions as Record<string, boolean> | null) ?? null }
    return (
      <Shell>
        <NotLinkedGate showRopLink={ropCanViewTeam(base)} />
      </Shell>
    )
  }

  const [pendingReminders, myDiscrepancyRows, looseRes, leaders, streak, achievements, challenge] =
    await Promise.all([
      listReminders({ companyId, bitrixManagerId, status: "pending", limit: 50 }),
      db
        .select({
          discrepancy: ropDiscrepancies,
          callStartedAt: ropCalls.startedAt,
          clientPhone: ropCalls.clientPhone,
        })
        .from(ropDiscrepancies)
        .innerJoin(ropCalls, eq(ropCalls.id, ropDiscrepancies.callId))
        .where(
          and(
            eq(ropDiscrepancies.tenantId, companyId),
            eq(ropDiscrepancies.routedToUserId, user.id as string),
            eq(ropDiscrepancies.status, "pending"),
          ),
        )
        .orderBy(desc(ropDiscrepancies.createdAt))
        .limit(50),
      db.execute(sql`
        SELECT c.id AS call_id, c.client_phone AS client_phone, c.started_at::text AS started_at,
               a.next_action AS next_action, a.summary AS summary
        FROM rop_calls c JOIN rop_analyses a ON a.call_id = c.id
        WHERE c.tenant_id = ${companyId}::uuid AND c.manager_id = ${bitrixManagerId}
          AND c.status = 'done'
          AND (c.duration_sec >= 60 OR length(COALESCE(a.summary,'')) > 100)
          AND (a.next_action IS NULL OR a.next_action = '' OR a.next_action = '—' OR a.next_action ~* 'не определ|нет следующ')
          AND substr(c.started_at::text,1,10) >= (CURRENT_DATE - INTERVAL '30 day')::text
        ORDER BY c.started_at DESC
        LIMIT 20
      `),
      getLeaderboard({ tenantId: companyId, myManagerId: bitrixManagerId, anonymize: true, daysBack: 30 }),
      getManagerStreak({ tenantId: companyId, bitrixManagerId }),
      getAchievementsFor({ tenantId: companyId, bitrixManagerId }),
      getWeeklyChallenge({ tenantId: companyId }),
    ])
  const looseRows = looseRes as unknown as LooseThreadRow[]

  return (
    <Shell>
      <div className="flex flex-col gap-4 pb-8">
        {/* Streak + challenge */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiTile
            icon={<Flame className="size-4 text-amber-500" />}
            label="Серия"
            value={`${streak.current_streak} дн.`}
            hint={
              streak.longest_streak > streak.current_streak
                ? `Рекорд — ${streak.longest_streak} дн.`
                : streak.current_streak > 0
                  ? "Это ваш рекорд!"
                  : undefined
            }
          />
          <WeeklyChallengeTile goal={challenge.goal} current={challenge.current} pct={challenge.pct} />
        </div>

        {/* Напоминания + Расхождения / Оборванные нити + Достижения */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <RemindersSection reminders={pendingReminders} />
            <LooseThreadsCard rows={looseRows} />
          </div>
          <div className="flex flex-col gap-4">
            <DiscrepancyInbox items={myDiscrepancyRows} />
            <AchievementsCard achievements={achievements} />
          </div>
        </div>

        {/* Лидерборд */}
        <LeaderboardCard leaders={leaders} />
      </div>
    </Shell>
  )
}
