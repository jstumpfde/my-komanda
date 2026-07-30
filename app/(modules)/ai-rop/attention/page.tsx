// /ai-rop/attention — «Точки внимания»: главный дашборд для собственника
// компании. Всё, что менеджеры упускают и что вручную в CRM не отследить —
// на одном экране. Тон формулировок сознательно мягкий и конструктивный
// («точки внимания», «недоработки»), см. докблок lib/ai-rop/attention.ts.
//
// Командная страница — требует requireRopTeamViewer (директор/head/
// rop_view_team), обычный менеджер такой обзор не видит (аналогично
// /ai-rop/discrepancies).
import { eq } from "drizzle-orm"
import { Compass, Clock3, PhoneOff, GitCompare, PhoneMissed, TrendingDown, ClipboardX } from "lucide-react"
import { db } from "@/lib/db"
import { ropManagers } from "@/lib/db/schema"
import { loadAttentionData, ATTENTION_CATEGORY_LABELS, ATTENTION_CATEGORY_ORDER, type AttentionCategory } from "@/lib/ai-rop/attention"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { requireRopTeamViewer } from "../_components/rop-guard"
import { DashboardFilters } from "../_components/dashboard-filters"
import { AttentionCategoryCard } from "./_components/attention-category-card"

export const dynamic = "force-dynamic"

const CATEGORY_ICONS: Record<AttentionCategory, typeof Clock3> = {
  promise_overdue: Clock3,
  deal_silent: PhoneOff,
  discrepancy: GitCompare,
  weak_call: PhoneMissed,
  negative_trend: TrendingDown,
  checklist_gap: ClipboardX,
}

export default async function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; manager_id?: string; period?: string }>
}) {
  const viewer = await requireRopTeamViewer()
  const sp = await searchParams
  const period = sp.period === "all" ? "all" : undefined

  const [data, managerRows] = await Promise.all([
    loadAttentionData({
      tenantId: viewer.companyId,
      from: period === "all" ? undefined : sp.from,
      to: period === "all" ? undefined : sp.to,
      managerId: sp.manager_id,
    }),
    db
      .select({ id: ropManagers.bitrixManagerId, name: ropManagers.name })
      .from(ropManagers)
      .where(eq(ropManagers.tenantId, viewer.companyId)),
  ])

  const managers = managerRows.map((m) => ({ id: m.id, name: m.name || `ID ${m.id}` }))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-1">
              <Compass className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Точки внимания</h1>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
              Всё, что менеджеры могли упустить и что вручную в CRM не уследить — собрано в одном месте.
              Это не список претензий, а помощник в управлении: где стоит подстраховать команду.
            </p>

            <DashboardFilters managers={managers} basePath="/ai-rop/attention" />

            <Card className="mb-5 border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20">
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
                <div>
                  <div className="text-2xl font-semibold">{data.total}</div>
                  <div className="text-xs text-muted-foreground">точек внимания</div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <div className={`text-2xl font-semibold ${data.urgentCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{data.urgentCount}</div>
                  <div className="text-xs text-muted-foreground">из них срочные</div>
                </div>
                <div className="ml-auto text-xs text-muted-foreground">
                  Тишина по сделке — от {data.silenceDays} дн. без касаний · Слабый звонок — оценка ≤ {data.weakScoreThreshold}/10
                  <span className="ml-1">(настраивается в Настройках)</span>
                </div>
              </CardContent>
            </Card>

            {data.total === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="mb-1 text-sm font-medium">Пока всё в порядке — точек внимания нет</div>
                  <div className="text-sm text-muted-foreground">
                    Как только появятся забытые обещания, замолчавшие сделки или расхождения с CRM — они появятся здесь.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {ATTENTION_CATEGORY_ORDER.map((cat) => {
                  const items = data.byCategory[cat]
                  if (items.length === 0) return null
                  return (
                    <AttentionCategoryCard
                      key={cat}
                      icon={CATEGORY_ICONS[cat]}
                      title={ATTENTION_CATEGORY_LABELS[cat]}
                      items={items}
                    />
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
