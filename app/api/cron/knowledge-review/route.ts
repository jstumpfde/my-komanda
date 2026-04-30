import { NextRequest, NextResponse } from "next/server"
import { and, eq, lt, or, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeArticles, demoTemplates, users } from "@/lib/db/schema"

import { checkCronAuth } from "@/lib/cron/auth"

// POST /api/cron/knowledge-review — Protected by X-Cron-Secret header.
// Cron endpoint that flags knowledge materials needing review.
// Call daily from an external scheduler (Timeweb cron, uptimerobot, etc.).

const REVIEW_DAYS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
}

interface ReviewItem {
  id: string
  type: "article" | "demo"
  title: string
  tenantId: string
  authorId: string | null
  authorEmail: string | null
  reason: "expiring" | "stale_cycle"
  validUntil: string | null
  cycle: string | null
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const items: ReviewItem[] = []

  try {
    // ── Articles: valid_until within 7 days ──
    const expiringArticles = await db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        tenantId: knowledgeArticles.tenantId,
        authorId: knowledgeArticles.authorId,
        authorEmail: users.email,
        validUntil: knowledgeArticles.validUntil,
      })
      .from(knowledgeArticles)
      .leftJoin(users, eq(users.id, knowledgeArticles.authorId))
      .where(
        and(
          isNotNull(knowledgeArticles.validUntil),
          lt(knowledgeArticles.validUntil, in7Days),
        ),
      )
    for (const a of expiringArticles) {
      items.push({
        id: a.id,
        type: "article",
        title: a.title,
        tenantId: a.tenantId,
        authorId: a.authorId,
        authorEmail: a.authorEmail,
        reason: "expiring",
        validUntil: a.validUntil ? a.validUntil.toISOString() : null,
        cycle: null,
      })
    }

    // ── Demos: valid_until within 7 days ──
    const expiringDemos = await db
      .select({
        id: demoTemplates.id,
        title: demoTemplates.name,
        tenantId: demoTemplates.tenantId,
        validUntil: demoTemplates.validUntil,
      })
      .from(demoTemplates)
      .where(
        and(
          isNotNull(demoTemplates.validUntil),
          lt(demoTemplates.validUntil, in7Days),
        ),
      )
    for (const d of expiringDemos) {
      items.push({
        id: d.id,
        type: "demo",
        title: d.title,
        tenantId: d.tenantId ?? "",
        authorId: null,
        authorEmail: null,
        reason: "expiring",
        validUntil: d.validUntil ? d.validUntil.toISOString() : null,
        cycle: null,
      })
    }

    // ── Articles: stale review cycle ──
    for (const [cycle, days] of Object.entries(REVIEW_DAYS)) {
      const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      const rows = await db
        .select({
          id: knowledgeArticles.id,
          title: knowledgeArticles.title,
          tenantId: knowledgeArticles.tenantId,
          authorId: knowledgeArticles.authorId,
          authorEmail: users.email,
          updatedAt: knowledgeArticles.updatedAt,
        })
        .from(knowledgeArticles)
        .leftJoin(users, eq(users.id, knowledgeArticles.authorId))
        .where(
          and(
            eq(knowledgeArticles.reviewCycle, cycle),
            lt(knowledgeArticles.updatedAt, threshold),
          ),
        )
      for (const a of rows) {
        items.push({
          id: a.id,
          type: "article",
          title: a.title,
          tenantId: a.tenantId,
          authorId: a.authorId,
          authorEmail: a.authorEmail,
          reason: "stale_cycle",
          validUntil: null,
          cycle,
        })
      }
    }

    // ── Demos: stale review cycle ──
    for (const [cycle, days] of Object.entries(REVIEW_DAYS)) {
      const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      const rows = await db
        .select({
          id: demoTemplates.id,
          title: demoTemplates.name,
          tenantId: demoTemplates.tenantId,
          updatedAt: demoTemplates.updatedAt,
        })
        .from(demoTemplates)
        .where(
          and(
            eq(demoTemplates.reviewCycle, cycle),
            lt(demoTemplates.updatedAt, threshold),
          ),
        )
      for (const d of rows) {
        items.push({
          id: d.id,
          type: "demo",
          title: d.title,
          tenantId: d.tenantId ?? "",
          authorId: null,
          authorEmail: null,
          reason: "stale_cycle",
          validUntil: null,
          cycle,
        })
      }
    }

    // MVP: log to server console and return list. Persisting notifications into
    // a dedicated table can be plugged in here once it exists.
    if (items.length > 0) {
      console.log(`[cron/knowledge-review] flagged ${items.length} items`, items.slice(0, 10))
    }

    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      checkedAt: now.toISOString(),
    })
  } catch (err) {
    console.error("[cron/knowledge-review]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
