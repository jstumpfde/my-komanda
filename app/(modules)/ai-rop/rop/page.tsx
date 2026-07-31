/**
 * /ai-rop/rop — «Кабинет РОПа»: единый экран для руководителя отдела продаж,
 * объединяющий приоритетные звонки, сжатую динамику команды и свежие заметки
 * аналитика — вместо блуждания по Дашборду / Динамике / Возражениям по отдельности.
 * Доступ: ropCanViewTeam (owner/admin/head/rop_view_team) — см. _components/rop-guard.ts.
 */
import Link from "next/link"
import { UserCog, AlertTriangle, TrendingUp, StickyNote, Briefcase } from "lucide-react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { requireRopTeamViewer } from "@/app/(modules)/ai-rop/_components/rop-guard"
import { getRopPriorityCalls, getRopTeamNotes, type RopPriorityCall, type RopManagerNotes } from "@/lib/ai-rop/rop-priority"
import { getTeamDynamics, type ManagerDynamics } from "@/lib/ai-rop/team-dynamics"
import { formatDateTime } from "@/app/(modules)/ai-rop/_components/format"
import { SentimentBadge, VerdictBadge, ManagerScoreBadge, riskStripeClass, verdictOrder } from "./_ui"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

export default async function RopPage() {
  const viewer = await requireRopTeamViewer()
  const companyId = viewer.companyId

  const [priorityCalls, teamNotes, dynamics] = await Promise.all([
    getRopPriorityCalls(companyId, 10),
    getRopTeamNotes(companyId),
    getTeamDynamics(companyId, 8),
  ])

  const sortedDynamics = [...dynamics].sort((a, b) => verdictOrder(a.verdict) - verdictOrder(b.verdict))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <TrialBanner />
            <div className="flex items-center gap-2 pt-3 pb-2">
              <UserCog className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Кабинет РОПа</h1>
            </div>
            <p className="text-sm text-muted-foreground pb-6">Что происходит в команде сегодня.</p>

            <div className="flex flex-col gap-8 pb-8">
              <PrioritySection calls={priorityCalls} />
              <DynamicsSection managers={sortedDynamics} />
              <NotesSection team={teamNotes} />
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

// ──────────────────────────────────────────────────────────────────────
// 1. «Требует внимания за 48ч»

function PrioritySection({ calls }: { calls: RopPriorityCall[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="size-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Требует внимания за 48 часов</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Звонки с самым высоким риском: низкая оценка, негативное настроение, привязка к сделке в CRM.
      </p>

      {calls.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Нет приоритетных звонков за 48 часов — хорошая новость.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {calls.map((c) => (
            <Link
              key={c.callId}
              href={`/ai-rop/calls/${c.callId}`}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted/40 transition-colors",
                riskStripeClass(c.risk),
              )}
            >
              <ManagerScoreBadge score={c.managerScore} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium">{c.managerName}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(c.startedAt)}</span>
                  <SentimentBadge sentiment={c.sentiment} />
                  {c.hasBitrixDeal && (
                    <Badge
                      variant="outline"
                      className="text-[11px] text-violet-700 border-violet-300 bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/40"
                    >
                      <Briefcase className="size-3" /> сделка в CRM
                    </Badge>
                  )}
                </div>
                {c.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {c.summary.length > 150 ? `${c.summary.slice(0, 150)}…` : c.summary}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 2. «Динамика команды» — сжатая версия dynamics/page.tsx

function DynamicsSection({ managers }: { managers: ManagerDynamics[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="size-4 text-violet-600" />
        <h2 className="text-sm font-semibold">Динамика команды</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Учится ли менеджер — выполнение чек-листа: было в начале периода → стало сейчас (8 недель).
      </p>

      {managers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Пока недостаточно оценённых звонков для динамики.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 overflow-hidden">
          <div className="divide-y divide-border/60">
            {managers.map((m) => (
              <div key={m.managerId} className="flex items-center gap-3 flex-wrap px-4 py-2.5">
                <span className="text-sm font-medium min-w-[140px]">{m.name}</span>
                <VerdictBadge verdict={m.verdict} />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Чек-лист: <span className="font-semibold text-foreground">{pct(m.earlyCompliance)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-semibold text-foreground">{pct(m.recentCompliance)}</span>
                </span>
                <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">{m.calls} звонков</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Link href="/ai-rop/dynamics" className="inline-block mt-2 text-xs font-medium text-violet-600 hover:underline">
        Смотреть подробную динамику →
      </Link>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 3. «Свежие заметки для РОПа»

function NotesSection({ team }: { team: RopManagerNotes[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <StickyNote className="size-4 text-violet-600" />
        <h2 className="text-sm font-semibold">Свежие заметки для РОПа</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Прямая честная оценка аналитика по звонкам за последние 7 дней (менеджер её не видит).
      </p>

      {team.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Нет свежих заметок за 7 дней.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {team.map((m) => (
            <Card key={m.managerId} className="py-4">
              <CardContent className="px-4">
                <p className="text-sm font-medium mb-2">{m.managerName}</p>
                <div className="flex flex-col gap-2.5">
                  {m.notes.map((n, i) => (
                    <div key={`${n.callId}-${i}`} className="text-sm leading-relaxed">
                      <Link
                        href={`/ai-rop/calls/${n.callId}`}
                        className="text-violet-600 font-medium hover:underline mr-1.5 whitespace-nowrap"
                      >
                        {formatDateTime(n.startedAt)}
                      </Link>
                      <span className="text-foreground">{n.text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
