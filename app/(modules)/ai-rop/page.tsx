// Дашборд AI-РОП — KPI, менеджеры, динамика, настроение, чек-лист, топ
// возражений/тем, продукты. Server component: данные — loadDashboardData()
// напрямую (lib/ai-rop/dashboard-data.ts), как в оригинале call-agent.
// Для роли manager — CoachInsights вместо таблицы менеджеров (RLS уже сузила
// выборку по bitrixManagerId внутри loadDashboardData).
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  Phone, CheckCircle2, XCircle, CircleDot, Clock, AlertTriangle, FileX,
  Star, ClipboardList, Timer, ArrowDownLeft, TrendingUp, AlertOctagon,
  Users, MessageSquare, Tag, Package, ChevronDown,
} from "lucide-react"

import { loadDashboardData } from "@/lib/ai-rop/dashboard-data"
import { getBillingStatus } from "@/lib/ai-rop/tokens"
import { getActiveShareToken } from "@/lib/ai-rop/dashboard-share"
import { requireRopViewer } from "./_components/rop-guard"
import { DashboardFilters } from "./_components/dashboard-filters"
import { ShareDashboardButton } from "./_components/share-dashboard-button"
import { PrintDashboardButton } from "./_components/print-dashboard-button"
import { TokenBalanceBanner } from "./_components/token-balance-banner"
import { CoachInsights } from "./_components/coach-insights"
import { KpiRow, KpiTile } from "./_components/kpi-tile"
import { ManagerMobileCard } from "./_components/manager-mobile-card"
import { formatDuration, formatTotalMinutes, capitalize, formatDateShort } from "./_components/format"

export const dynamic = "force-dynamic"

function productLabel(p: string | null): string {
  if (p === "__no_transcript__") return "Без транскрипта"
  if (p === "__no_match__") return "Без темы"
  return p || "Не определён"
}
function productColor(p: string | null): string {
  if (!p) return "var(--muted-foreground)"
  const code = p.toUpperCase()
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360
  return `hsl(${h}, 65%, 50%)`
}
function scoreTextColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (pct >= 40) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}
function scoreBg(pct: number): string {
  if (pct >= 80) return "bg-emerald-500"
  if (pct >= 40) return "bg-amber-500"
  return "bg-red-500"
}

function SentimentMini({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg || 1
  return (
    <div className="min-w-[100px]">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${(pos / total) * 100}%` }} />
        <div className="bg-muted-foreground/50" style={{ width: `${(neu / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(neg / total) * 100}%` }} />
      </div>
      <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
        <span className="text-emerald-600 dark:text-emerald-400">+{pos}</span>
        <span>={neu}</span>
        <span className="text-red-600 dark:text-red-400">-{neg}</span>
      </div>
    </div>
  )
}

export default async function AiRopDashboardPage(props: {
  searchParams: Promise<{ from?: string; to?: string; with_crm?: string; manager_id?: string }>
}) {
  const viewer = await requireRopViewer()
  const sp = await props.searchParams

  const data = await loadDashboardData({
    tenantId: viewer.companyId,
    from: sp.from,
    to: sp.to,
    withCrmOnly: sp.with_crm === "true",
    managerId: viewer.isTeamViewer ? sp.manager_id : undefined,
    managerBitrixId: viewer.isManager ? (viewer.bitrixManagerId ?? undefined) : undefined,
  })

  const periodLabel = sp.from || sp.to
    ? `${sp.from ? formatDateShort(sp.from) : "…"} — ${sp.to ? formatDateShort(sp.to) : "…"}`
    : "за всё время"

  const [shareToken, billingStatus] = viewer.isTeamViewer
    ? await Promise.all([getActiveShareToken(viewer.companyId), getBillingStatus(viewer.companyId)])
    : [null, null]

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://company24.pro"
  const maxObjection = data.topObjections.length ? Math.max(...data.topObjections.map((o) => o.count)) : 1
  const productTotal = data.productStats.reduce((s, p) => s + p.calls, 0) || 1

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {billingStatus && <TokenBalanceBanner status={billingStatus} />}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 pt-3 pb-1">
                  <Phone className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold">{viewer.isManager ? "Мой кабинет" : "AI-РОП — Дашборд"}</h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  Период: <span className="font-medium text-foreground">{periodLabel}</span>
                  {viewer.isManager && viewer.name ? <> · {viewer.name}</> : null}
                </p>
              </div>
              {viewer.isTeamViewer && (
                <div className="flex items-center gap-2">
                  <PrintDashboardButton />
                  <ShareDashboardButton initialToken={shareToken} baseUrl={baseUrl} />
                </div>
              )}
            </div>

            <DashboardFilters managers={viewer.isTeamViewer ? data.managersList : undefined} />

            {viewer.isManager && <CoachInsights companyId={viewer.companyId} bitrixManagerId={viewer.bitrixManagerId} />}

            {/* ── KPI: stretch-flow 2+3+4 (бэклог ca 10.07) ── */}
            <KpiRow>
              <KpiTile icon={Phone} label="Всего звонков" value={String(data.totals.total)} size="lg" />
              <KpiTile icon={CheckCircle2} label="Проанализировано" value={String(data.totals.done)} color="text-emerald-600" size="lg" />
            </KpiRow>
            <KpiRow>
              <KpiTile icon={Clock} label="В обработке" value={String(data.totals.in_progress)} color="text-violet-600" />
              <KpiTile icon={FileX} label="Без записи" value={String(data.totals.no_recording)} color="text-amber-600" />
              <KpiTile icon={AlertTriangle} label="Ошибки" value={String(data.totals.failed)} color="text-red-600" />
            </KpiRow>
            <KpiRow className="mb-6">
              <KpiTile icon={Star} label="Ср. оценка" value={data.aggs.avg_score != null ? `${data.aggs.avg_score.toFixed(1)} / 10` : "—"} color="text-amber-500" size="sm" />
              <KpiTile icon={ClipboardList} label="Ср. чек-лист" value={data.aggs.avg_compliance != null ? `${Math.round(data.aggs.avg_compliance * 100)}%` : "—"} color="text-violet-600" size="sm" />
              <KpiTile icon={Timer} label="Ср. длительность" value={formatDuration(data.totals.avg_duration)} size="sm" />
              <KpiTile icon={ArrowDownLeft} label="Вход. / Исход." value={`${data.totals.incoming} / ${data.totals.outgoing}`} size="sm" />
            </KpiRow>

            {/* ── Менеджеры ── */}
            {viewer.isTeamViewer && (
              <div className="mb-4 rounded-xl border bg-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4 text-violet-600" /> Менеджеры — детальная статистика
                  </h2>
                  <span className="text-xs text-muted-foreground">всего: {data.allManagers.length}</span>
                </div>
                {data.allManagers.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Пока данных нет</div>
                ) : (
                  <>
                    <div className="md:hidden">
                      {data.allManagers.map((m) => <ManagerMobileCard key={m.manager_id} m={m} />)}
                    </div>
                    <div className="hidden md:block">
                      <DataTable>
                        <DataHead>
                          <DataHeadCell>ФИО / ID</DataHeadCell>
                          <DataHeadCell align="right">Всего</DataHeadCell>
                          <DataHeadCell align="right">Минут</DataHeadCell>
                          <DataHeadCell align="right">Контактов*</DataHeadCell>
                          <DataHeadCell align="right">Вход.</DataHeadCell>
                          <DataHeadCell align="right">Исход.</DataHeadCell>
                          <DataHeadCell align="right">Пропущ.**</DataHeadCell>
                          <DataHeadCell>Оценка</DataHeadCell>
                          <DataHeadCell>Чек-лист</DataHeadCell>
                          <DataHeadCell>Настроение</DataHeadCell>
                        </DataHead>
                        <tbody>
                          {data.allManagers.map((m) => {
                            const st = m.pos + m.neu + m.neg
                            const pct = m.calls > 0 ? Math.round((m.connected / m.calls) * 100) : 0
                            return (
                              <DataRow key={m.manager_id}>
                                <DataCell className="font-medium">{m.manager_name || <span className="text-muted-foreground">ID {m.manager_id}</span>}</DataCell>
                                <DataCell align="right" className="font-semibold">{m.calls}</DataCell>
                                <DataCell align="right" className="whitespace-nowrap">{formatTotalMinutes(m.total_seconds)}</DataCell>
                                <DataCell align="right">
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{m.connected}</span>
                                  <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>
                                </DataCell>
                                <DataCell align="right">{m.incoming}</DataCell>
                                <DataCell align="right">{m.outgoing}</DataCell>
                                <DataCell align="right">
                                  <span className={m.missed > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>{m.missed}</span>
                                </DataCell>
                                <DataCell>{m.avg_score != null ? (<span className="inline-flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" />{m.avg_score.toFixed(1)}</span>) : "—"}</DataCell>
                                <DataCell>{m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"}</DataCell>
                                <DataCell>{st === 0 ? <span className="text-muted-foreground">—</span> : <SentimentMini pos={m.pos} neu={m.neu} neg={m.neg} />}</DataCell>
                              </DataRow>
                            )
                          })}
                        </tbody>
                      </DataTable>
                    </div>
                  </>
                )}
                <div className="mt-3 text-[11px] text-muted-foreground">
                  * Контактов — звонки длительностью ≥ {data.contactThreshold} сек. ** Пропущ. — входящие без ответа (0 сек), совпадает с колонкой «Пропущенные» в Битрикс.
                </div>
              </div>
            )}

            {/* ── Чек-лист: выполнение пунктов ── */}
            <details className="mb-4 rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 select-none">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="size-4 text-violet-600" /> Чек-лист — выполнение пунктов
                  <span className="font-normal text-muted-foreground">· {data.selectedManagerName ? `по менеджеру: ${data.selectedManagerName}` : "по всей команде"}</span>
                </h2>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">пунктов: {data.checklistItemsBreakdown.length}<ChevronDown className="size-3.5" /></span>
              </summary>
              <div className="px-4 pb-4">
                {data.checklistItemsBreakdown.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Чек-лист ещё не оценивался</div>
                ) : (
                  <>
                    <DataTable>
                      <DataHead>
                        <DataHeadCell>Пункт чек-листа</DataHeadCell>
                        <DataHeadCell>Средний score</DataHeadCell>
                        <DataHeadCell align="right">% выполнения</DataHeadCell>
                        <DataHeadCell align="right">Оценок</DataHeadCell>
                      </DataHead>
                      <tbody>
                        {data.checklistItemsBreakdown.map((it, idx) => {
                          const isTop = idx < 3
                          const passPct = Math.round(it.pass_rate * 100)
                          return (
                            <DataRow key={it.id} className={isTop ? "bg-red-500/5" : undefined}>
                              <DataCell className={isTop ? "font-semibold" : undefined}>
                                {isTop && <AlertOctagon className="mr-1.5 inline size-3 text-red-500" />}
                                {it.title}
                              </DataCell>
                              <DataCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                    <div className={`h-full rounded-full ${scoreBg(it.avg_score * 100)}`} style={{ width: `${it.avg_score * 100}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold">{Math.round(it.avg_score * 100)}%</span>
                                </div>
                              </DataCell>
                              <DataCell align="right"><span className={`font-semibold ${scoreTextColor(passPct)}`}>{passPct}%</span></DataCell>
                              <DataCell align="right" className="text-muted-foreground">{it.count}</DataCell>
                            </DataRow>
                          )
                        })}
                      </tbody>
                    </DataTable>
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      % выполнения — доля звонков, где пункт оценён ≥ 70%. Top-3 проблемных пунктов подсвечены. Сортировка: от худшего к лучшему.
                    </div>
                  </>
                )}
              </div>
            </details>

            {/* ── Динамика 14 дней ── */}
            <div className="mb-4 rounded-xl border bg-card p-5">
              <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="size-4 text-violet-600" /> Динамика за 14 дней
              </h2>
              {data.totals.total === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Пока данных нет</div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex h-40 items-end gap-1.5" style={{ minWidth: data.series.length > 7 ? data.series.length * 30 : undefined }}>
                    {data.series.map((s) => {
                      const tot = s.positive + s.negative + s.neutral || s.total
                      const hPx = Math.round((s.total / data.maxDaily) * 130) + 2
                      return (
                        <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
                          <div className={`text-[11px] text-muted-foreground ${s.total ? "" : "invisible"}`}>{s.total}</div>
                          <div className="flex w-full flex-col overflow-hidden rounded bg-muted" style={{ height: hPx }} title={`${s.day}: всего ${s.total}`}>
                            {tot > 0 && (<>
                              <div className="bg-emerald-500" style={{ flex: s.positive || 0 }} />
                              <div className="bg-muted-foreground/50" style={{ flex: s.neutral || 0 }} />
                              <div className="bg-red-500" style={{ flex: s.negative || 0 }} />
                            </>)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{s.day.slice(8, 10)}.{s.day.slice(5, 7)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="mt-2.5 flex gap-3.5 text-xs">
                <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-emerald-500" />Позитив</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-muted-foreground/50" />Нейтрально</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-red-500" />Негатив</span>
              </div>
            </div>

            {/* ── Настроение + слабые пункты ── */}
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><CircleDot className="size-4 text-violet-600" /> Настроение заказчиков</h2>
                {data.sentTotal === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Пока данных нет</div> : (
                  <>
                    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                      <div className="bg-emerald-500" style={{ width: `${(data.sentMap.positive / data.sentTotal) * 100}%` }} />
                      <div className="bg-muted-foreground/50" style={{ width: `${(data.sentMap.neutral / data.sentTotal) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(data.sentMap.negative / data.sentTotal) * 100}%` }} />
                    </div>
                    <div className="mt-3.5 space-y-1 text-sm text-muted-foreground">
                      <div className="flex justify-between py-1"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-500" /> Позитивных</span><span>{data.sentMap.positive} <span className="opacity-60">({Math.round((data.sentMap.positive / data.sentTotal) * 100)}%)</span></span></div>
                      <div className="flex justify-between py-1"><span className="inline-flex items-center gap-1.5"><CircleDot className="size-3.5" /> Нейтральных</span><span>{data.sentMap.neutral} <span className="opacity-60">({Math.round((data.sentMap.neutral / data.sentTotal) * 100)}%)</span></span></div>
                      <div className="flex justify-between py-1"><span className="inline-flex items-center gap-1.5"><XCircle className="size-3.5 text-red-500" /> Негативных</span><span>{data.sentMap.negative} <span className="opacity-60">({Math.round((data.sentMap.negative / data.sentTotal) * 100)}%)</span></span></div>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><AlertOctagon className="size-4 text-violet-600" /> Слабые места в скрипте</h2>
                {data.checklistStats.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Чек-лист ещё не оценивался</div> : (
                  <div className="flex flex-col gap-2.5">
                    {data.checklistStats.slice(0, 6).map((c) => (
                      <div key={c.id}>
                        <div className="mb-1 flex justify-between text-[13px]"><span>{c.title}</span><span className="text-muted-foreground">{Math.round(c.avg * 100)}% · {c.n} зв.</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${scoreBg(c.avg * 100)}`} style={{ width: `${c.avg * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Топ возражений + топ тем ── */}
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4 text-violet-600" /> Топ возражений</h2>
                {data.topObjections.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Пока данных нет</div> : (
                  <div className="flex flex-col gap-1.5">
                    {data.topObjections.map((o) => (
                      <div key={o.title} className="flex items-center gap-2.5">
                        <div className="flex-1 truncate text-[13px]">{capitalize(o.title)}</div>
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(o.count / maxObjection) * 100}%` }} /></div>
                        <div className="w-6 text-right text-xs font-semibold">{o.count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Tag className="size-4 text-violet-600" /> Топ тем</h2>
                {data.topTopics.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Пока данных нет</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.topTopics.map((t) => (
                      <Badge key={t.title} variant="secondary" className="font-normal">{t.title} <b className="ml-1">{t.count}</b></Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Распределение по продуктам ── */}
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Package className="size-4 text-violet-600" /> Распределение по продуктам</h2>
                <span className="text-xs text-muted-foreground">AI определяет продукт по содержанию разговора</span>
              </div>
              {data.productStats.length === 0 || (data.productStats.length === 1 && !data.productStats[0].product) ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Скрипты с привязкой к продуктам ещё не настроены, или нет проанализированных звонков.</div>
              ) : (
                <>
                  <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
                    {data.productStats.map((p) => (
                      <div key={p.product || "unknown"} title={`${productLabel(p.product)}: ${p.calls}`} style={{ width: `${(p.calls / productTotal) * 100}%`, backgroundColor: productColor(p.product) }} />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3.5 text-xs">
                    {data.productStats.map((p) => (
                      <span key={p.product || "unknown"} className="inline-flex items-center gap-1.5">
                        <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: productColor(p.product) }} />
                        <span className="text-muted-foreground">{productLabel(p.product)}</span>
                        <b>{p.calls}</b>
                        <span className="text-muted-foreground">({Math.round((p.calls / productTotal) * 100)}%)</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-3.5 md:hidden">
                    {data.productStats.map((p) => {
                      const st = p.pos + p.neu + p.neg
                      const pct = p.calls > 0 ? Math.round((p.connected / p.calls) * 100) : 0
                      return (
                        <div key={p.product || "unknown"} className="mb-2.5 rounded-xl border bg-card p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2 font-semibold">
                              <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: productColor(p.product) }} />
                              {productLabel(p.product)}
                            </span>
                            {p.avg_score != null && <span className="inline-flex items-center gap-1 font-bold"><Star className="size-3.5 fill-amber-400 text-amber-400" />{p.avg_score.toFixed(1)}</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>Звонков: <b>{p.calls}</b></div>
                            <div>Контактов: <b className="text-emerald-600">{p.connected} ({pct}%)</b></div>
                            <div>Чек-лист: <b>{p.avg_compliance != null ? `${Math.round(p.avg_compliance * 100)}%` : "—"}</b></div>
                          </div>
                          {st > 0 && <div className="mt-2"><SentimentMini pos={p.pos} neu={p.neu} neg={p.neg} /></div>}
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3.5 hidden md:block">
                    <DataTable>
                      <DataHead>
                        <DataHeadCell>Продукт</DataHeadCell>
                        <DataHeadCell align="right">Звонков</DataHeadCell>
                        <DataHeadCell align="right">Контактов</DataHeadCell>
                        <DataHeadCell align="right">Минут</DataHeadCell>
                        <DataHeadCell>Ср. оценка</DataHeadCell>
                        <DataHeadCell>Чек-лист</DataHeadCell>
                        <DataHeadCell>Настроение</DataHeadCell>
                      </DataHead>
                      <tbody>
                        {data.productStats.map((p) => {
                          const st = p.pos + p.neu + p.neg
                          const pct = p.calls > 0 ? Math.round((p.connected / p.calls) * 100) : 0
                          return (
                            <DataRow key={p.product || "unknown"}>
                              <DataCell>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: productColor(p.product) }} />
                                  <span className={!p.product ? "text-muted-foreground" : "font-semibold"}>{productLabel(p.product)}</span>
                                </span>
                              </DataCell>
                              <DataCell align="right" className="font-semibold">{p.calls}</DataCell>
                              <DataCell align="right"><span className="font-semibold text-emerald-600 dark:text-emerald-400">{p.connected}</span> <span className="text-xs text-muted-foreground">({pct}%)</span></DataCell>
                              <DataCell align="right" className="whitespace-nowrap">{formatTotalMinutes(p.total_seconds)}</DataCell>
                              <DataCell>{p.avg_score != null ? (<span className="inline-flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" />{p.avg_score.toFixed(1)}</span>) : "—"}</DataCell>
                              <DataCell>{p.avg_compliance != null ? `${Math.round(p.avg_compliance * 100)}%` : "—"}</DataCell>
                              <DataCell>{st === 0 ? <span className="text-muted-foreground">—</span> : <SentimentMini pos={p.pos} neu={p.neu} neg={p.neg} />}</DataCell>
                            </DataRow>
                          )
                        })}
                      </tbody>
                    </DataTable>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
