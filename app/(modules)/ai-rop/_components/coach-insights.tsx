// «Зоны роста» + «Свежие подсказки» для роли manager на дашборде AI-РОП
// (порт ca dashboard/CoachInsights.tsx). Показывает топ-3 худших пункта
// чек-листа за 30 дней и последние 5 coaching_tips по звонкам менеджера.
// Прямые SQL-запросы (не через lib/ai-rop — эта зона не моя, а логика узко
// специфична для этого блока дашборда).
import Link from "next/link"
import { sql } from "drizzle-orm"
import { TrendingDown, Lightbulb } from "lucide-react"
import { db } from "@/lib/db"

interface ScoreItem { id?: string; title?: string; score?: number }
interface ItemAggregate { title: string; avgScore: number; count: number }

export async function CoachInsights({ companyId, bitrixManagerId }: { companyId: string; bitrixManagerId: string | null }) {
  if (!bitrixManagerId) return null

  const [scoreRows, tipRows] = await Promise.all([
    db.execute(sql`
      SELECT a.checklist_scores_json AS checklist_scores_json
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE c.tenant_id = ${companyId}::uuid
        AND c.manager_id = ${bitrixManagerId}
        AND a.checklist_scores_json IS NOT NULL
        AND c.started_at >= (CURRENT_DATE - INTERVAL '30 day')
      LIMIT 500
    `) as unknown as Promise<Array<{ checklist_scores_json: unknown }>>,
    db.execute(sql`
      SELECT a.call_id AS call_id, a.coaching_tips_json AS coaching_tips_json
      FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
      WHERE c.tenant_id = ${companyId}::uuid
        AND c.manager_id = ${bitrixManagerId}
        AND a.coaching_tips_json IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 5
    `) as unknown as Promise<Array<{ call_id: string; coaching_tips_json: unknown }>>,
  ])

  const byTitle = new Map<string, { sum: number; n: number }>()
  for (const row of scoreRows) {
    const items = Array.isArray(row.checklist_scores_json) ? (row.checklist_scores_json as ScoreItem[]) : []
    for (const item of items) {
      if (!item.title || typeof item.score !== "number") continue
      const cur = byTitle.get(item.title) ?? { sum: 0, n: 0 }
      cur.sum += item.score
      cur.n += 1
      byTitle.set(item.title, cur)
    }
  }
  const aggregates: ItemAggregate[] = Array.from(byTitle.entries())
    .map(([title, v]) => ({ title, avgScore: v.sum / v.n, count: v.n }))
    .filter((a) => a.count >= 3)
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 3)

  const recentTips: Array<{ callId: string; tip: string }> = []
  for (const row of tipRows) {
    const tips = Array.isArray(row.coaching_tips_json) ? (row.coaching_tips_json as string[]) : []
    for (const tip of tips) {
      if (recentTips.length < 5) recentTips.push({ callId: row.call_id, tip })
    }
  }

  if (aggregates.length === 0 && recentTips.length === 0) return null

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
      {aggregates.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold">
            <TrendingDown className="size-4 text-amber-500" /> Зоны роста
          </h3>
          <p className="mb-3.5 text-xs text-muted-foreground">
            Пункты чек-листа с самой низкой средней оценкой за последние 30 дней. Не приговор — подсказка где можно прибавить.
          </p>
          <div className="flex flex-col gap-2.5">
            {aggregates.map((a, i) => {
              const pct = a.avgScore * 100
              const color = pct < 30 ? "text-red-600 dark:text-red-400" : pct < 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
              const bg = pct < 30 ? "bg-red-500" : pct < 60 ? "bg-amber-500" : "bg-emerald-500"
              return (
                <div key={a.title}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="font-medium"><span className="mr-1.5 text-muted-foreground">{i + 1}.</span>{a.title}</span>
                    <span className={`font-semibold ${color}`}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${bg}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">Найдено в {a.count} звонках</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recentTips.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-violet-600" /> Свежие подсказки
          </h3>
          <p className="mb-3.5 text-xs text-muted-foreground">Советы по последним звонкам. Клик по # открывает звонок.</p>
          <ul className="flex flex-col gap-2.5">
            {recentTips.map((t, i) => (
              <li key={`${t.callId}-${i}`} className="flex gap-2 text-[13px] leading-relaxed">
                <Link href={`/ai-rop/calls/${t.callId}`} className="shrink-0 font-semibold text-violet-600 hover:underline">#{t.callId.slice(0, 8)}</Link>
                <span>{t.tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
