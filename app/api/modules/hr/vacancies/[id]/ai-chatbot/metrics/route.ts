// #15-phase6: метрики AI-чат-бота за последние 7 дней + квота сегодня.
import { NextRequest, NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

interface Row { c: number }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params

    // Проверка прав: вакансия должна быть в компании пользователя.
    const [v] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!v) return NextResponse.json({ error: "not found" }, { status: 404 })

    // Аггрегаты за 7 дней по этой вакансии.
    const totalsRows = (await db.execute(sql`
      SELECT
        count(*)::int                                                   AS total,
        count(*) FILTER (WHERE sent_at IS NOT NULL)::int                AS sent,
        count(*) FILTER (WHERE escalated_to_hr = true)::int             AS escalated,
        count(*) FILTER (WHERE intent_category = 'rejection_signal')::int AS rejected,
        COALESCE(AVG(intent_confidence)::float, 0)                       AS avg_confidence
      FROM ai_chatbot_messages
      WHERE vacancy_id = ${id}::uuid
        AND created_at >= NOW() - INTERVAL '7 days'
    `)) as unknown as Array<{ total: number; sent: number; escalated: number; rejected: number; avg_confidence: number }>
    const t = totalsRows?.[0] ?? { total: 0, sent: 0, escalated: 0, rejected: 0, avg_confidence: 0 }

    // По категориям.
    const byCatRows = (await db.execute(sql`
      SELECT intent_category AS cat, count(*)::int AS c
      FROM ai_chatbot_messages
      WHERE vacancy_id = ${id}::uuid
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY intent_category
    `)) as unknown as Array<{ cat: string; c: number }>
    const byCategory: Record<string, number> = {}
    for (const r of byCatRows ?? []) byCategory[r.cat] = Number(r.c)

    // Квота сегодня (по компании).
    const today = new Date().toISOString().slice(0, 10)
    const quotaRows = (await db.execute(sql`
      SELECT count FROM ai_chatbot_quota
      WHERE company_id = ${user.companyId}::uuid AND date = ${today}::date
    `)) as unknown as Array<Row & { count: number }>
    const todayCount = Number(quotaRows?.[0]?.count ?? 0)
    const limit = parseInt(process.env.AI_CHATBOT_DAILY_LIMIT ?? "1000", 10) || 1000
    const pct = limit > 0 ? Math.min(100, Math.round((todayCount / limit) * 100)) : 0

    return NextResponse.json({
      // Legacy shape used by existing UI:
      metrics: {
        total:     Number(t.total),
        sent:      Number(t.sent),
        escalated: Number(t.escalated),
        rejected:  Number(t.rejected),
      },
      // New (Phase 6) fields:
      totalProcessed: Number(t.total),
      autoReplied:    Number(t.sent),
      escalatedToHr:  Number(t.escalated),
      rejectedByAi:   Number(t.rejected),
      avgConfidence:  Number(t.avg_confidence),
      byCategory,
      quotaUsage: { today: todayCount, limit, pct },
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
