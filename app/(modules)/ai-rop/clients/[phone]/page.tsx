/**
 * /ai-rop/clients/[phone] — профиль заказчика 360.
 *
 * URL = нормализованный телефон (digits-only), см. lib/ai-rop/clients.ts.
 * Один телефон = один профиль (matching через Bitrix contact_id/phone book —
 * будущая итерация). Показывает KPI, CRM-привязки, оборванные нити,
 * менеджеров и единую хронологию всех типов взаимодействий.
 *
 * Доступ: тот же гейт, что и в списке (см. ../page.tsx) — не привязанный
 * менеджер видит заглушку «нет доступа» вместо редиректа.
 */
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import {
  Users, ArrowLeft, AlertTriangle, Briefcase, UserCheck, Calendar,
  ArrowDownLeft, ArrowUpRight, Star,
} from "lucide-react"
import { auth } from "@/auth"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { getClientProfile, detectLooseThreads, type InteractionTimelineItem } from "@/lib/ai-rop/clients"
import { normalizePhone } from "@/lib/ai-rop/pii-mask"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  typeIcon, typeIconBg, typeLabel, formatDate, formatDateTime, formatDuration,
  truncateText, SentimentBadge, LOOSE_THREAD_LABELS,
} from "../_ui"

export const dynamic = "force-dynamic"

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6 space-y-4" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-1">
              <Users className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Клиенты</h1>
            </div>
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ phone: string }>
}) {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  const companyId = user.companyId
  const isTeamViewer = ropCanViewTeam(user)
  const scopedManagerId = isTeamViewer ? null : await ropManagerScope({ id: user.id, companyId })
  const noAccess = !isTeamViewer && !scopedManagerId

  if (noAccess) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Нет доступа к клиентам — вы не привязаны как менеджер.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  const { phone } = await params
  const normalized = normalizePhone(decodeURIComponent(phone))
  if (!normalized || normalized.length < 7) notFound()

  const result = await getClientProfile({ tenantId: companyId, normalizedPhone: normalized, managerId: scopedManagerId })
  if (!result) notFound()
  const { summary, timeline } = result
  const looseThreads = detectLooseThreads(timeline)
  const sentimentTotal = summary.positive + summary.neutral + summary.negative

  return (
    <Shell>
      <Link href="/ai-rop/clients" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="size-3.5" /> К списку клиентов
      </Link>

      {/* Шапка профиля */}
      <Card>
        <CardContent>
          <div>
            <div className="text-lg font-semibold">{summary.name || summary.display_phone || "Без имени"}</div>
            {summary.name && <div className="text-sm text-muted-foreground">{summary.display_phone}</div>}
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              {formatDate(summary.first_at)} → {formatDate(summary.last_at)}
            </div>
          </div>

          <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <KpiTile label="Всего касаний" value={String(summary.total_count)} icon={<UserCheck className="size-3.5" />} />
            {Object.entries(summary.by_type).map(([type, count]) => (
              <KpiTile key={type} label={typeLabel(type)} value={String(count)} icon={typeIcon(type, "size-3.5")} />
            ))}
          </div>

          {sentimentTotal > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs text-muted-foreground">Настроение по всем касаниям</div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="bg-emerald-500" style={{ width: `${(summary.positive / sentimentTotal) * 100}%` }} title={`Позитив: ${summary.positive}`} />
                <div className="bg-muted-foreground/40" style={{ width: `${(summary.neutral / sentimentTotal) * 100}%` }} title={`Нейтрально: ${summary.neutral}`} />
                <div className="bg-red-500" style={{ width: `${(summary.negative / sentimentTotal) * 100}%` }} title={`Негатив: ${summary.negative}`} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {summary.positive} позитив · {summary.neutral} нейтр. · {summary.negative} негатив
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CRM-привязки */}
      {(summary.deal_ids.length > 0 || summary.lead_ids.length > 0 || summary.contact_ids.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="size-4 text-violet-600" />
              Связь с CRM
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {summary.deal_ids.map((id) => (
              <Badge key={`d${id}`} variant="secondary">Сделка #{id}</Badge>
            ))}
            {summary.lead_ids.map((id) => (
              <Badge key={`l${id}`} variant="secondary">Лид #{id}</Badge>
            ))}
            {summary.contact_ids.map((id) => (
              <Badge key={`c${id}`} variant="secondary">Контакт #{id}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Оборванные нити */}
      {looseThreads.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              Оборванные нити ({looseThreads.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Эвристики простые — удобный список для разбора с менеджером, а не жёсткое правило.
            </p>
            {looseThreads.map((t, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md border border-border/60 bg-background p-2.5">
                <Link href={`/ai-rop/calls/${t.callId}`} className="shrink-0 text-sm font-semibold text-primary">
                  #{t.callId}
                </Link>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {LOOSE_THREAD_LABELS[t.kind] || t.kind}
                  </div>
                  <div className="mt-0.5 text-sm">{t.description}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Менеджеры */}
      {summary.managers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserCheck className="size-4 text-violet-600" />
              Менеджеры
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {summary.managers.map((m) => (
              <Badge key={m.id ?? m.name ?? "_"} variant="secondary">
                {m.name || `ID ${m.id || "?"}`} · {m.count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Хронология */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Хронология ({timeline.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {timeline.map((it, i) => (
              <TimelineRow key={it.id} it={it} last={i === timeline.length - 1} />
            ))}
          </div>
        </CardContent>
      </Card>
    </Shell>
  )
}

function KpiTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-muted p-2.5">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-base font-semibold">{value}</div>
      </div>
    </div>
  )
}

function TimelineRow({ it, last }: { it: InteractionTimelineItem; last: boolean }) {
  return (
    <div className={`relative flex gap-3 pt-1 ${last ? "pb-0" : "pb-4"}`}>
      {!last && <div className="absolute bottom-0 left-[13px] top-8 w-px bg-border" />}
      <div className={`grid size-7 shrink-0 place-items-center rounded-full text-white ${typeIconBg(it.interaction_type)}`}>
        {typeIcon(it.interaction_type, "size-3.5")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{formatDateTime(it.started_at)}</span>
          <span>·</span>
          <span>{typeLabel(it.interaction_type)}</span>
          {it.direction && (
            <span className="inline-flex items-center">
              {it.direction === "in" ? (
                <ArrowDownLeft className="size-3 text-emerald-600" />
              ) : (
                <ArrowUpRight className="size-3 text-primary" />
              )}
            </span>
          )}
          {it.manager_name && (
            <>
              <span>·</span>
              <span>{it.manager_name}</span>
            </>
          )}
          {it.duration_sec > 0 && (
            <>
              <span>·</span>
              <span>{formatDuration(it.duration_sec)}</span>
            </>
          )}
        </div>

        <div className="mt-1 flex items-start gap-2">
          <Link href={`/ai-rop/calls/${it.id}`} className="shrink-0 text-sm font-semibold text-primary">
            #{it.id}
          </Link>
          <div className="min-w-0 flex-1 text-sm leading-relaxed">
            {it.summary ? (
              truncateText(it.summary, 200)
            ) : (
              <span className="italic text-muted-foreground">{it.status === "done" ? "Анализ без summary" : it.status}</span>
            )}
            {it.next_action && (
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-primary">След. шаг: </span>
                {it.next_action}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <SentimentBadge value={it.sentiment} />
            {it.manager_score != null && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <Star className="size-3" fill="currentColor" />
                {it.manager_score.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
