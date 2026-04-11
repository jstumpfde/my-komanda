import { eq, and, sql, or, lt, gte, desc, isNotNull, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  learningAssignments, users,
  knowledgeArticles, demoTemplates,
  knowledgeQuestionLogs,
} from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getLeaderboard } from "@/lib/knowledge/achievements"

const REVIEW_DAYS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
}

export async function GET() {
  try {
    const user = await requireCompany()
    const tenantId = user.companyId
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // ── Material counts ──
    const [demosTotal] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, tenantId))

    const [articlesTotal] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.tenantId, tenantId))

    const totalMaterials = (demosTotal?.c ?? 0) + (articlesTotal?.c ?? 0)

    // ── Assignment counts by status ──
    const assignmentCounts = await db
      .select({
        status: learningAssignments.status,
        c: sql<number>`count(*)::int`,
      })
      .from(learningAssignments)
      .where(eq(learningAssignments.tenantId, tenantId))
      .groupBy(learningAssignments.status)

    const byStatus = new Map(assignmentCounts.map((r) => [r.status, r.c]))
    const completed = byStatus.get("completed") ?? 0
    const inProgress = byStatus.get("in_progress") ?? 0

    // Overdue: status='overdue' OR (deadline IS NOT NULL AND deadline < now AND status != 'completed')
    const [overdueRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(learningAssignments)
      .where(
        and(
          eq(learningAssignments.tenantId, tenantId),
          or(
            eq(learningAssignments.status, "overdue"),
            and(
              isNotNull(learningAssignments.deadline),
              lt(learningAssignments.deadline, now),
              ne(learningAssignments.status, "completed"),
            ),
          ),
        ),
      )
    const overdue = overdueRow?.c ?? 0

    // ── Materials needing update ──
    // valid_until is set and expires within 7 days
    const [articlesExpiring] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(knowledgeArticles)
      .where(
        and(
          eq(knowledgeArticles.tenantId, tenantId),
          isNotNull(knowledgeArticles.validUntil),
          lt(knowledgeArticles.validUntil, in7Days),
        ),
      )
    const [demosExpiring] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(demoTemplates)
      .where(
        and(
          eq(demoTemplates.tenantId, tenantId),
          isNotNull(demoTemplates.validUntil),
          lt(demoTemplates.validUntil, in7Days),
        ),
      )

    // review cycle expired: updated_at + interval < now. Compute per cycle.
    let articlesStale = 0
    let demosStale = 0
    for (const [cycle, days] of Object.entries(REVIEW_DAYS)) {
      const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      const [a] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(knowledgeArticles)
        .where(
          and(
            eq(knowledgeArticles.tenantId, tenantId),
            eq(knowledgeArticles.reviewCycle, cycle),
            lt(knowledgeArticles.updatedAt, threshold),
          ),
        )
      const [d] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(demoTemplates)
        .where(
          and(
            eq(demoTemplates.tenantId, tenantId),
            eq(demoTemplates.reviewCycle, cycle),
            lt(demoTemplates.updatedAt, threshold),
          ),
        )
      articlesStale += a?.c ?? 0
      demosStale += d?.c ?? 0
    }
    const needsUpdate =
      (articlesExpiring?.c ?? 0) + (demosExpiring?.c ?? 0) + articlesStale + demosStale

    // ── Employee progress ──
    const progressRows = await db
      .select({
        userId: learningAssignments.userId,
        userName: users.name,
        userPosition: users.position,
        userRole: users.role,
        status: learningAssignments.status,
        deadline: learningAssignments.deadline,
        c: sql<number>`count(*)::int`,
      })
      .from(learningAssignments)
      .leftJoin(users, eq(users.id, learningAssignments.userId))
      .where(eq(learningAssignments.tenantId, tenantId))
      .groupBy(
        learningAssignments.userId,
        users.name,
        users.position,
        users.role,
        learningAssignments.status,
        learningAssignments.deadline,
      )

    type ProgressStatus = "on_track" | "behind" | "not_started"
    interface EmpAggr {
      userId: string
      name: string
      position: string
      assigned: number
      done: number
      overdue: number
      status: ProgressStatus
    }
    const empMap = new Map<string, EmpAggr>()
    for (const row of progressRows) {
      const key = row.userId
      const existing = empMap.get(key) ?? {
        userId: key,
        name: row.userName ?? "—",
        position: row.userPosition ?? row.userRole ?? "",
        assigned: 0,
        done: 0,
        overdue: 0,
        status: "not_started" as ProgressStatus,
      }
      existing.assigned += row.c
      if (row.status === "completed") existing.done += row.c
      const isDeadlinePast = row.deadline ? new Date(row.deadline) < now : false
      if (row.status === "overdue" || (isDeadlinePast && row.status !== "completed")) {
        existing.overdue += row.c
      }
      empMap.set(key, existing)
    }
    const employeeProgress = [...empMap.values()]
      .map((e) => {
        let status: ProgressStatus = "on_track"
        if (e.done === 0) status = "not_started"
        else if (e.overdue > 0 || e.done < e.assigned * 0.5) status = "behind"
        return { ...e, status }
      })
      .sort((a, b) => b.assigned - a.assigned)
      .slice(0, 10)

    // ── Top authors (from knowledge_articles — demo_templates has no author FK) ──
    const authorRows = await db
      .select({
        authorId: knowledgeArticles.authorId,
        name: users.name,
        role: users.role,
        position: users.position,
        created: sql<number>`count(*)::int`,
        lastActivity: sql<Date>`max(${knowledgeArticles.updatedAt})`,
      })
      .from(knowledgeArticles)
      .leftJoin(users, eq(users.id, knowledgeArticles.authorId))
      .where(
        and(
          eq(knowledgeArticles.tenantId, tenantId),
          isNotNull(knowledgeArticles.authorId),
        ),
      )
      .groupBy(knowledgeArticles.authorId, users.name, users.role, users.position)
      .orderBy(desc(sql`count(*)`))
      .limit(5)

    const topAuthors = authorRows.map((r) => ({
      name: r.name ?? "—",
      role: r.position ?? r.role ?? "",
      created: r.created,
      updated: r.created,
      lastActivity: r.lastActivity ? new Date(r.lastActivity).toISOString() : null,
    }))

    // ── Ненси рекомендует: топ-5 неотвеченных вопросов за 7 дней ──
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const unansweredRows = await db
      .select({
        questionKey: knowledgeQuestionLogs.questionKey,
        sample: sql<string>`max(${knowledgeQuestionLogs.question})`,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeQuestionLogs)
      .where(
        and(
          eq(knowledgeQuestionLogs.tenantId, tenantId),
          eq(knowledgeQuestionLogs.answered, false),
          gte(knowledgeQuestionLogs.createdAt, weekAgo),
        ),
      )
      .groupBy(knowledgeQuestionLogs.questionKey)
      .orderBy(desc(sql`count(*)`))
      .limit(5)

    const nensiHints = unansweredRows
      .filter((r) => r.sample && r.sample.trim().length > 0)
      .map((r) => ({
        emoji: r.count >= 3 ? "🔴" : "❓",
        title: r.count >= 3 ? `${r.count} запросов без ответа` : "Вопрос без ответа",
        desc: r.sample ?? "",
      }))

    // ── Активность за неделю: 7 дней, группировка по дате ──
    const dayMs = 24 * 60 * 60 * 1000
    const weeklyBuckets: { date: Date; key: string; label: string }[] = []
    const dayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs)
      d.setHours(0, 0, 0, 0)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      weeklyBuckets.push({
        date: d,
        key: `${yyyy}-${mm}-${dd}`,
        label: dayLabels[d.getDay()],
      })
    }

    const activityRows = await db
      .select({
        day: sql<string>`to_char(${knowledgeQuestionLogs.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeQuestionLogs)
      .where(
        and(
          eq(knowledgeQuestionLogs.tenantId, tenantId),
          gte(knowledgeQuestionLogs.createdAt, weeklyBuckets[0].date),
        ),
      )
      .groupBy(sql`to_char(${knowledgeQuestionLogs.createdAt}, 'YYYY-MM-DD')`)

    const activityMap = new Map(activityRows.map((r) => [r.day, r.count]))
    const weeklyActivity = weeklyBuckets.map((b) => ({
      day: b.label,
      views: activityMap.get(b.key) ?? 0,
    }))
    const weeklyTotal = weeklyActivity.reduce((s, d) => s + d.views, 0)

    // ── Последние обновления: топ 10 из articles+demos по updatedAt ──
    const [recentArticles, recentDemos] = await Promise.all([
      db
        .select({
          id: knowledgeArticles.id,
          name: knowledgeArticles.title,
          updatedAt: knowledgeArticles.updatedAt,
          author: users.name,
        })
        .from(knowledgeArticles)
        .leftJoin(users, eq(users.id, knowledgeArticles.authorId))
        .where(eq(knowledgeArticles.tenantId, tenantId))
        .orderBy(desc(knowledgeArticles.updatedAt))
        .limit(10),
      db
        .select({
          id: demoTemplates.id,
          name: demoTemplates.name,
          updatedAt: demoTemplates.updatedAt,
        })
        .from(demoTemplates)
        .where(eq(demoTemplates.tenantId, tenantId))
        .orderBy(desc(demoTemplates.updatedAt))
        .limit(10),
    ])

    const recentUpdates = [
      ...recentArticles.map((a) => ({
        id: a.id,
        name: a.name,
        type: "Статья",
        author: a.author ?? "—",
        updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : null,
      })),
      ...recentDemos.map((d) => ({
        id: d.id,
        name: d.name,
        type: "Презентация",
        author: "—",
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
      })),
    ]
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return tb - ta
      })
      .slice(0, 10)

    // ── Leaderboard (геймификация): топ-5 по очкам ──
    const leaderboard = await getLeaderboard(tenantId, 5)

    return apiSuccess({
      metrics: {
        totalMaterials,
        completed,
        inProgress,
        overdue,
        needsUpdate,
      },
      totals: {
        assignments:
          completed + inProgress + (byStatus.get("assigned") ?? 0) + (byStatus.get("overdue") ?? 0),
      },
      employeeProgress,
      topAuthors,
      nensiHints,
      weeklyActivity,
      weeklyTotal,
      recentUpdates,
      leaderboard,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/dashboard-stats GET]", err)
    return apiError("Internal server error", 500)
  }
}
