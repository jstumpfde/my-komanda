// «Очередь» — диагностика пайплайна обработки AI-РОП (порт §4.3 ca queue/page.tsx):
// счётчики по статусам, скорость обработки, отставание, источники ошибок,
// throughput за 7 дней. Доступ — только team-viewer (директор/head/rop_view_team),
// это операционная инфа, менеджеру не нужна.
import { sql } from "drizzle-orm"
import { Activity, Hourglass, CheckCircle2, XCircle, FileX, Clock, AlertTriangle, Zap } from "lucide-react"
import { db } from "@/lib/db"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { requireRopTeamViewer } from "../_components/rop-guard"

export const dynamic = "force-dynamic"

const PROCESSING_STATUSES = ["downloading", "transcribing", "analyzing", "syncing"]

function bucketError(err: string): string {
  const e = err.toLowerCase()
  if (/anthropic|claude|529|overloaded/.test(e)) return "Anthropic (LLM)"
  if (/openai|whisper|transcribe|country/.test(e)) return "OpenAI (Whisper)"
  if (/yandex|speechkit/.test(e)) return "Yandex SpeechKit"
  if (/bitrix|portal_user|crm|webhook/.test(e)) return "Bitrix24"
  if (/recording|no.?file|files in activity|webdav/.test(e)) return "Нет записи"
  if (/postgres|column|relation|database/.test(e)) return "База данных"
  if (/timeout|econnreset|fetch failed|socket hang/.test(e)) return "Сеть"
  if (/credit balance|payment|budget/.test(e)) return "Бюджет / кредиты исчерпаны"
  if (/forbidden|403|request not allowed/.test(e)) return "Гео-блок / прокси"
  return "Прочее"
}

function KpiCard({ icon, label, value, color, hint }: { icon: React.ReactNode; label: string; value: string; color: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="mb-1.5 flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-[28px] font-bold leading-none">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
function Metric({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

export default async function QueuePage() {
  const viewer = await requireRopTeamViewer()

  const [statusRows, speedRow, lagRow, errorRows, dailyRows] = await Promise.all([
    db.execute(sql`SELECT status, COUNT(*)::int AS n FROM rop_calls WHERE tenant_id = ${viewer.companyId}::uuid GROUP BY status ORDER BY n DESC`) as unknown as Promise<Array<{ status: string; n: number }>>,
    db.execute(sql`
      SELECT
        SUM(CASE WHEN updated_at >= NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END)::int AS last_hour,
        SUM(CASE WHEN updated_at >= NOW() - INTERVAL '1 day'  THEN 1 ELSE 0 END)::int AS last_day
      FROM rop_calls WHERE tenant_id = ${viewer.companyId}::uuid AND status = 'done'
    `) as unknown as Promise<Array<{ last_hour: number; last_day: number }>>,
    db.execute(sql`SELECT MAX(updated_at) AS last_done FROM rop_calls WHERE tenant_id = ${viewer.companyId}::uuid AND status = 'done'`) as unknown as Promise<Array<{ last_done: string | null }>>,
    db.execute(sql`SELECT error FROM rop_calls WHERE tenant_id = ${viewer.companyId}::uuid AND status = 'failed' AND error IS NOT NULL`) as unknown as Promise<Array<{ error: string }>>,
    db.execute(sql`
      SELECT substr(updated_at::text, 1, 10) AS day,
             SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)::int AS done,
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)::int AS failed
      FROM rop_calls
      WHERE tenant_id = ${viewer.companyId}::uuid AND updated_at >= (CURRENT_DATE - INTERVAL '6 day')
      GROUP BY day ORDER BY day ASC
    `) as unknown as Promise<Array<{ day: string; done: number; failed: number }>>,
  ])

  const totals: Record<string, number> = {}
  for (const r of statusRows) totals[r.status] = Number(r.n)
  const total = statusRows.reduce((s, r) => s + Number(r.n), 0)
  const processing = PROCESSING_STATUSES.reduce((s, st) => s + (totals[st] ?? 0), 0)
  const failedTotal = totals["failed"] ?? 0
  const failedShare = total > 0 ? (failedTotal / total) * 100 : 0

  const lastHour = Number(speedRow[0]?.last_hour ?? 0)
  const lastDay = Number(speedRow[0]?.last_day ?? 0)
  const lastDoneAt = lagRow[0]?.last_done ?? null
  const lagMinutes = lastDoneAt ? Math.max(0, Math.floor((Date.now() - new Date(lastDoneAt).getTime()) / 60000)) : null

  const buckets: Record<string, number> = {}
  for (const r of errorRows) { const b = bucketError(r.error); buckets[b] = (buckets[b] ?? 0) + 1 }
  const errorBuckets = Object.entries(buckets).map(([bucket, n]) => ({ bucket, n })).sort((a, b) => b.n - a.n)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-2">
              <Activity className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Очередь обработки</h1>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">Состояние пайплайна анализа звонков и переписок в реальном времени.</p>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard icon={<Hourglass className="size-4" />} label="В ожидании" value={String(totals["pending"] ?? 0)} color="var(--warning, #d97706)" hint="Ждут когда крон их подберёт" />
              <KpiCard icon={<Zap className="size-4" />} label="В обработке" value={String(processing)} color="var(--primary)" hint={PROCESSING_STATUSES.join(" → ")} />
              <KpiCard icon={<CheckCircle2 className="size-4" />} label="Готово" value={String(totals["done"] ?? 0)} color="#059669" hint="Успешно проанализированы" />
              <KpiCard icon={<XCircle className="size-4" />} label="Ошибка" value={String(failedTotal)} color="#dc2626" hint={`${failedShare.toFixed(1)}% от всех`} />
              <KpiCard icon={<FileX className="size-4" />} label="Без записи" value={String(totals["no_recording"] ?? 0)} color="var(--muted-foreground)" hint="Bitrix не вернул файл" />
            </div>

            <div className="mb-5 rounded-xl border bg-card p-5">
              <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><Clock className="size-4 text-violet-600" /> Скорость и отставание</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Metric label="Обработано за час" value={`${lastHour} звонков`} hint={lastHour > 0 ? `~${Math.round((60 / lastHour) * 10) / 10} мин/звонок` : "—"} />
                <Metric label="Обработано за день" value={`${lastDay} звонков`} hint={lastDay > 0 ? `~${Math.round(lastDay / 24)} в час в среднем` : "—"} />
                <Metric
                  label="Отставание"
                  value={lagMinutes == null ? "—" : lagMinutes < 60 ? `${lagMinutes} мин` : `${Math.floor(lagMinutes / 60)} ч ${lagMinutes % 60} мин`}
                  hint={lastDoneAt ? `Последний done: ${new Date(lastDoneAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}` : "Не было успешных"}
                  warn={lagMinutes != null && lagMinutes > 30}
                />
              </div>
            </div>

            <div className="mb-5 rounded-xl border bg-card p-5">
              <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-violet-600" /> Источники ошибок</h2>
              <p className="mb-3 text-xs text-muted-foreground">Откуда пришли техсбои обработки (не сами звонки). Обычно временные ошибки провайдера — повторная попытка проходит автоматически.</p>
              {errorBuckets.length === 0 ? (
                <div className="text-sm text-muted-foreground">Нет failed-звонков. Все звонки либо обработаны успешно, либо без записи.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {errorBuckets.map((b) => {
                    const pct = failedTotal > 0 ? (b.n / failedTotal) * 100 : 0
                    return (
                      <div key={b.bucket}>
                        <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">{b.bucket}</span><span className="text-muted-foreground">{b.n} ({pct.toFixed(0)}%)</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} /></div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {dailyRows.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3.5 text-sm font-semibold">Динамика обработки (7 дней)</h2>
                <DataTable>
                  <DataHead>
                    <DataHeadCell>День</DataHeadCell>
                    <DataHeadCell align="right">Готово</DataHeadCell>
                    <DataHeadCell align="right">Ошибки</DataHeadCell>
                    <DataHeadCell align="right">% успеха</DataHeadCell>
                  </DataHead>
                  <tbody>
                    {dailyRows.map((d) => {
                      const sum = Number(d.done) + Number(d.failed)
                      const successPct = sum > 0 ? (Number(d.done) / sum) * 100 : 0
                      return (
                        <DataRow key={d.day}>
                          <DataCell>{d.day.slice(8, 10)}.{d.day.slice(5, 7)}.{d.day.slice(2, 4)}</DataCell>
                          <DataCell align="right" className="font-semibold text-emerald-600 dark:text-emerald-400">{d.done}</DataCell>
                          <DataCell align="right" className={Number(d.failed) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{d.failed}</DataCell>
                          <DataCell align="right">{successPct.toFixed(0)}%</DataCell>
                        </DataRow>
                      )
                    })}
                  </tbody>
                </DataTable>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
