import { NextRequest } from "next/server"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeQuestionLogs } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// GET  /api/modules/knowledge/gaps
// Возвращает топ неотвеченных вопросов за 7 дней + общий счётчик.
// POST — тот же список (alias для UI-триггера «Запустить аудит»).

interface Gap {
  questionKey: string
  sample: string
  count: number
  lastAskedAt: string | null
}

async function loadGaps(tenantId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      questionKey: knowledgeQuestionLogs.questionKey,
      sample: sql<string>`max(${knowledgeQuestionLogs.question})`,
      cnt: sql<number>`count(*)::int`,
      last: sql<Date>`max(${knowledgeQuestionLogs.createdAt})`,
    })
    .from(knowledgeQuestionLogs)
    .where(
      and(
        eq(knowledgeQuestionLogs.tenantId, tenantId),
        eq(knowledgeQuestionLogs.answered, false),
        gte(knowledgeQuestionLogs.createdAt, since),
      ),
    )
    .groupBy(knowledgeQuestionLogs.questionKey)
    .orderBy(desc(sql`count(*)`))
    .limit(20)

  const items: Gap[] = rows
    .filter((r) => r.questionKey && r.sample)
    .map((r) => ({
      questionKey: r.questionKey ?? "",
      sample: r.sample ?? "",
      count: Number(r.cnt),
      lastAskedAt: r.last ? new Date(r.last).toISOString() : null,
    }))

  const total = items.reduce((s, i) => s + i.count, 0)

  return { items, total, uniqueQuestions: items.length }
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const data = await loadGaps(user.companyId)
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const data = await loadGaps(user.companyId)
    return apiSuccess({ ok: true, ...data })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
