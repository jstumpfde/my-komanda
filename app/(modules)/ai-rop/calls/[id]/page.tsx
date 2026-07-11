// Карточка звонка AI-РОП: плеер, диалог по репликам, весь AI-разбор
// (оценка/чек-лист/тональность/возражения/следующий шаг/coaching_tips),
// блок «Для РОПа» (rop_notes) скрыт от manager, CRM-блок с исходом лида,
// кнопки действий. Server component — читает rop_calls/rop_transcripts/
// rop_analyses напрямую (RLS: manager видит только свой звонок).
import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq } from "drizzle-orm"
import {
  ArrowLeft, Star, ClipboardList, User, FileAudio, Info, CheckCircle2, XCircle,
  CircleDot, MessageSquare, Tag, Phone, ArrowDownLeft, ArrowUpRight, Briefcase,
  UserPlus, ExternalLink, CalendarClock, Sparkles, Lightbulb, ShieldAlert,
} from "lucide-react"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls, ropTranscripts } from "@/lib/db/schema"
import { getRopSettings } from "@/lib/ai-rop/settings"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { requireRopViewer } from "../../_components/rop-guard"
import { SentimentBadge, LeadOutcomeBadge } from "../../_components/badges"
import { ChecklistBlock, type ChecklistScoreItem } from "../../_components/checklist-block"
import { formatDateTime, formatDuration } from "../../_components/format"
import { ReprocessButton, DeepAnalyzeButton, EnrichCrmButton, SendToCrmButton } from "./CallActions"

export const dynamic = "force-dynamic"

type Dialogue = Array<{ speaker: "manager" | "client" | "unknown"; text: string }>

const TYPE_LABELS: Record<string, string> = { call: "Звонок", chat: "Чат", email: "Email", meeting: "Встреча" }
const CHANNEL_LABELS: Record<string, string> = {
  bitrix_telephony: "Bitrix24 АТС", openlines: "Bitrix Open Lines", whatsapp: "WhatsApp",
  telegram: "Telegram", email_imap: "Email", zoom: "Zoom", yandex_telemost: "Яндекс Телемост",
  dictaphone: "Диктофон", manual: "ручная загрузка", other: "другое",
}

function sanitizePortalUrl(url: string | null): string | null {
  if (!url) return null
  try { const p = new URL(url); return p.protocol === "https:" ? url : null } catch { return null }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{value}</span>
    </div>
  )
}
function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 text-lg font-bold">{icon}{value}</div>
    </div>
  )
}
function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div className="mt-3.5">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="text-sm leading-relaxed">{body}</div>
    </div>
  )
}
function CrmLink({ icon, kindLabel, id, title, portalUrl, path }: {
  icon: React.ReactNode; kindLabel: string; id: string; title: string | null; portalUrl: string | null; path: string
}) {
  const safeUrl = sanitizePortalUrl(portalUrl)
  const href = safeUrl ? `${safeUrl}/${path}` : null
  const displayTitle = (title && title.trim()) || `#${id}`
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{kindLabel}:</span>
        <span className="truncate text-sm font-medium">{displayTitle}</span>
        {title && <span className="text-[11px] text-muted-foreground">#{id}</span>}
      </div>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs text-violet-600 hover:underline">
          Открыть в Bitrix <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  )
}

export default async function CallDetailPage(props: { params: Promise<{ id: string }> }) {
  const viewer = await requireRopViewer()
  const { id } = await props.params

  const [call] = await db.select().from(ropCalls).where(and(eq(ropCalls.id, id), eq(ropCalls.tenantId, viewer.companyId))).limit(1)
  if (!call) notFound()
  if (viewer.isManager && (!viewer.bitrixManagerId || call.managerId !== viewer.bitrixManagerId)) notFound()

  const [[transcript], [analysis], ropSettings] = await Promise.all([
    db.select().from(ropTranscripts).where(eq(ropTranscripts.callId, id)).limit(1),
    db.select().from(ropAnalyses).where(eq(ropAnalyses.callId, id)).limit(1),
    viewer.isTeamViewer ? getRopSettings(viewer.companyId) : Promise.resolve(null),
  ])

  const objections = Array.isArray(analysis?.objectionsJson) ? (analysis.objectionsJson as string[]) : []
  const topics = Array.isArray(analysis?.topicsJson) ? (analysis.topicsJson as string[]) : []
  const checklistScores = Array.isArray(analysis?.checklistScoresJson) ? (analysis.checklistScoresJson as ChecklistScoreItem[]) : []
  const coachingTips = Array.isArray(analysis?.coachingTipsJson) ? (analysis.coachingTipsJson as string[]) : []
  const ropNotes = Array.isArray(analysis?.ropNotesJson) ? (analysis.ropNotesJson as string[]) : []
  const dialogue: Dialogue = Array.isArray(transcript?.dialogueJson) ? (transcript.dialogueJson as Dialogue) : []

  const typeLabel = `${TYPE_LABELS[call.type] || call.type}${call.channel ? ` · ${CHANNEL_LABELS[call.channel] || call.channel}` : ""}`

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <Link href="/ai-rop/calls" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> К списку
            </Link>

            <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <Phone className="size-5 text-violet-600" />
                {call.managerName || "Менеджер"} → {call.clientPhone || "заказчик"}
                {analysis?.clientName && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <User className="size-3.5" /> {analysis.clientName}
                  </span>
                )}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {call.leadStatusId && <LeadOutcomeBadge statusId={call.leadStatusId} />}
                {analysis?.callbackAgreed && analysis.callbackPhrase && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CalendarClock className="size-3.5" /> Согласован созвон
                  </span>
                )}
                {viewer.isTeamViewer && (
                  <div className="flex items-center gap-2">
                    <DeepAnalyzeButton callId={call.id} />
                    <ReprocessButton callId={call.id} />
                  </div>
                )}
              </div>
            </div>

            {call.error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <b className="text-destructive">Ошибка обработки:</b> {call.error}
              </div>
            )}

            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Info className="size-4 text-violet-600" /> Информация</h2>
                <Row label="Тип" value={typeLabel} />
                <Row label="ID источника" value={call.bitrixCallId || "—"} />
                <Row label="Дата" value={formatDateTime(call.startedAt)} />
                <Row label="Менеджер" value={call.managerName || call.managerId || "—"} />
                <Row label="Заказчик" value={call.clientPhone || "—"} />
                <Row label="Имя (из разговора)" value={analysis?.clientName || "—"} />
                <Row label="Направление" value={
                  call.direction === "in" ? <span className="inline-flex items-center gap-1"><ArrowDownLeft className="size-3.5 text-emerald-500" /> Входящий</span>
                  : call.direction === "out" ? <span className="inline-flex items-center gap-1"><ArrowUpRight className="size-3.5 text-violet-600" /> Исходящий</span>
                  : "—"
                } />
                <Row label="Длительность" value={formatDuration(call.durationSec)} />
                <Row label="Статус" value={call.status} />
              </div>

              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileAudio className="size-4 text-violet-600" /> Запись</h2>
                {call.recordingPath ? (
                  <audio controls className="w-full" src={`/api/modules/ai-rop/recordings/${call.id}`} />
                ) : (
                  <div className="text-sm text-muted-foreground">Запись не скачана</div>
                )}
              </div>
            </div>

            {(call.bitrixDealId || call.bitrixLeadId || call.bitrixContactId) && (
              <div className="mb-4 rounded-xl border bg-card p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><Briefcase className="size-4 text-violet-600" /> CRM</h2>
                  {viewer.isTeamViewer && <EnrichCrmButton callId={call.id} />}
                </div>
                <div className="flex flex-col gap-2">
                  {call.bitrixDealId && <CrmLink icon={<Briefcase className="size-3.5 text-violet-600" />} kindLabel="Сделка" id={call.bitrixDealId} title={call.bitrixDealTitle} portalUrl={call.bitrixPortalUrl} path={`crm/deal/details/${call.bitrixDealId}/`} />}
                  {call.bitrixLeadId && <CrmLink icon={<UserPlus className="size-3.5 text-violet-600" />} kindLabel="Лид" id={call.bitrixLeadId} title={call.bitrixLeadTitle} portalUrl={call.bitrixPortalUrl} path={`crm/lead/details/${call.bitrixLeadId}/`} />}
                  {call.bitrixContactId && <CrmLink icon={<User className="size-3.5 text-violet-600" />} kindLabel="Контакт" id={call.bitrixContactId} title={call.bitrixContactName} portalUrl={call.bitrixPortalUrl} path={`crm/contact/details/${call.bitrixContactId}/`} />}
                </div>
                {call.dealStageId && (
                  <div className="mt-2.5 text-xs text-muted-foreground">Стадия сделки: <span className="font-medium text-foreground">{call.dealStageId}</span></div>
                )}
              </div>
            )}

            {analysis && (
              <div className="mb-4 rounded-xl border bg-card p-5">
                <h2 className="mb-3.5 text-sm font-semibold">AI-анализ</h2>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Metric
                    label="Настроение"
                    icon={analysis.sentiment === "positive" ? <CheckCircle2 className="size-4 text-emerald-500" /> : analysis.sentiment === "negative" ? <XCircle className="size-4 text-red-500" /> : <CircleDot className="size-4 text-muted-foreground" />}
                    value={analysis.sentiment === "positive" ? "Позитив" : analysis.sentiment === "negative" ? "Негатив" : "Нейтральное"}
                  />
                  <Metric icon={<Star className="size-4 text-amber-500" />} label="Оценка менеджера" value={analysis.managerScore != null ? `${analysis.managerScore.toFixed(1)} / 10` : "—"} />
                  <Metric icon={<ClipboardList className="size-4 text-violet-600" />} label="Чек-лист" value={analysis.scriptCompliance != null ? `${Math.round(analysis.scriptCompliance * 100)}%` : "—"} />
                </div>

                <Section title="Краткое содержание" body={analysis.summary} />
                <Section title="Следующий шаг" body={analysis.nextAction} />

                {coachingTips.length > 0 && (
                  <div className="mt-3.5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600"><Lightbulb className="size-3.5" /> Что попробовать в следующий раз</div>
                    <ul className="ml-4 list-disc space-y-1.5 text-sm leading-relaxed">
                      {coachingTips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                  </div>
                )}

                {viewer.isTeamViewer && ropNotes.length > 0 && (
                  <div className="mt-3.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400"><ShieldAlert className="size-3.5" /> Для РОПа — прямая оценка (менеджер не видит)</div>
                    <ul className="ml-4 list-disc space-y-1.5 text-sm leading-relaxed">
                      {ropNotes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}

                {objections.length > 0 && (
                  <div className="mt-3.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><MessageSquare className="size-3" /> Возражения</div>
                    <ul className="ml-4 list-disc space-y-0.5 text-sm">{objections.map((o, i) => <li key={i}>{o}</li>)}</ul>
                  </div>
                )}

                {topics.length > 0 && (
                  <div className="mt-3.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Tag className="size-3" /> Темы</div>
                    <div className="flex flex-wrap gap-1.5">{topics.map((t) => <span key={t} className="rounded-md border bg-muted px-2 py-0.5 text-xs">{t}</span>)}</div>
                  </div>
                )}

                {viewer.isTeamViewer && ropSettings && <SendToCrmButton callId={call.id} dryRun={ropSettings.dryRunCrm} />}
              </div>
            )}

            {checklistScores.length > 0 && <div className="mb-4"><ChecklistBlock items={checklistScores} /></div>}

            {dialogue.length > 0 && (
              <div className="mb-4 rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4 text-violet-600" /> Диалог</h2>
                <div className="mb-2.5 text-xs text-muted-foreground">Псевдо-диаризация — реплики размечены AI по косвенным признакам, точность не 100%.</div>
                <div className="flex flex-col gap-2">
                  {dialogue.map((turn, i) => {
                    const isManagerTurn = turn.speaker === "manager"
                    const isClient = turn.speaker === "client"
                    return (
                      <div key={i} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-xl border px-3.5 py-2.5 ${isManagerTurn ? "bg-accent" : isClient ? "bg-emerald-500/10" : "bg-muted"}`}>
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{isManagerTurn ? "Менеджер" : isClient ? "Заказчик" : "?"}</div>
                          <div className="whitespace-pre-wrap text-sm">{turn.text}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-violet-600" /> Полная стенограмма</h2>
              {transcript ? (
                <div className="max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-relaxed">{transcript.text}</div>
              ) : (
                <div className="text-sm text-muted-foreground">Транскрипт ещё не готов</div>
              )}
            </div>

            {viewer.isTeamViewer && (
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="ghost" asChild><Link href="/ai-rop/settings">Настройки AI-РОП</Link></Button>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
