import { NextRequest } from "next/server"
import { and, eq, inArray, isNotNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates, knowledgeArticles } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// GET  — список устаревших/на-проверку материалов текущего тенанта
// POST — прогнать проверку для тенанта и обновить статусы статей

const REVIEW_DAYS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "12m": 365,
  "1y": 365,
}

type FlagReason = "expired" | "review"

interface FlaggedItem {
  id: string
  type: "article" | "demo"
  title: string
  reason: FlagReason
  href: string
}

async function computeFlagged(tenantId: string): Promise<FlaggedItem[]> {
  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const result: FlaggedItem[] = []

  const articles = await db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      reviewCycle: knowledgeArticles.reviewCycle,
      validUntil: knowledgeArticles.validUntil,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.tenantId, tenantId),
        or(
          isNotNull(knowledgeArticles.validUntil),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "1m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "3m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "6m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "12m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "1y")),
        ),
      ),
    )

  for (const a of articles) {
    const validUntil = a.validUntil ? new Date(a.validUntil) : null
    const updatedAt = a.updatedAt ? new Date(a.updatedAt) : null
    let reason: FlagReason | null = null

    if (validUntil && validUntil < now) reason = "expired"
    else if (validUntil && validUntil < in7Days) reason = "review"
    else if (a.reviewCycle && a.reviewCycle !== "none" && updatedAt) {
      const days = REVIEW_DAYS[a.reviewCycle]
      if (days) {
        const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
        if (updatedAt < threshold) reason = "review"
      }
    }

    if (reason) {
      result.push({
        id: a.id,
        type: "article",
        title: a.title,
        reason,
        href: `/knowledge-v2/editor?id=${a.id}&type=article`,
      })
    }
  }

  const demos = await db
    .select({
      id: demoTemplates.id,
      name: demoTemplates.name,
      reviewCycle: demoTemplates.reviewCycle,
      validUntil: demoTemplates.validUntil,
      updatedAt: demoTemplates.updatedAt,
    })
    .from(demoTemplates)
    .where(
      and(
        eq(demoTemplates.tenantId, tenantId),
        or(
          isNotNull(demoTemplates.validUntil),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "1m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "3m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "6m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "12m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "1y")),
        ),
      ),
    )

  for (const d of demos) {
    const validUntil = d.validUntil ? new Date(d.validUntil) : null
    const updatedAt = d.updatedAt ? new Date(d.updatedAt) : null
    let reason: FlagReason | null = null

    if (validUntil && validUntil < now) reason = "expired"
    else if (validUntil && validUntil < in7Days) reason = "review"
    else if (d.reviewCycle && d.reviewCycle !== "none" && updatedAt) {
      const days = REVIEW_DAYS[d.reviewCycle]
      if (days) {
        const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
        if (updatedAt < threshold) reason = "review"
      }
    }

    if (reason) {
      result.push({
        id: d.id,
        type: "demo",
        title: d.name,
        reason,
        href: `/knowledge-v2/editor?id=${d.id}&type=demo`,
      })
    }
  }

  return result
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const items = await computeFlagged(user.companyId)
    return apiSuccess({
      items,
      total: items.length,
      expired: items.filter((i) => i.reason === "expired").length,
      review: items.filter((i) => i.reason === "review").length,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const items = await computeFlagged(user.companyId)

    const expiredIds = items.filter((i) => i.type === "article" && i.reason === "expired").map((i) => i.id)
    const reviewIds = items.filter((i) => i.type === "article" && i.reason === "review").map((i) => i.id)

    if (expiredIds.length > 0) {
      await db
        .update(knowledgeArticles)
        .set({ status: "expired" })
        .where(inArray(knowledgeArticles.id, expiredIds))
    }
    if (reviewIds.length > 0) {
      await db
        .update(knowledgeArticles)
        .set({ status: "review" })
        .where(inArray(knowledgeArticles.id, reviewIds))
    }

    return apiSuccess({
      ok: true,
      items,
      total: items.length,
      expired: items.filter((i) => i.reason === "expired").length,
      review: items.filter((i) => i.reason === "review").length,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
