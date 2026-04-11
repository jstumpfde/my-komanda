import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  demoTemplates,
  knowledgeArticles,
  notifications,
  users,
} from "@/lib/db/schema"

// GET /api/cron/knowledge-freshness?secret=CRON_SECRET
// Scans knowledge base materials, updates stale/expired status, and notifies
// each tenant's director / hr_lead (DB notification + Telegram, if connected).

const REVIEW_DAYS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  // Support both "12m" (per TZ) and legacy "1y" used elsewhere in the codebase
  "12m": 365,
  "1y": 365,
}

type FlagReason = "expired" | "review"

interface FlaggedItem {
  id: string
  type: "article" | "demo"
  title: string
  tenantId: string
  reason: FlagReason
}

async function sendTelegram(token: string, chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.error("[cron/knowledge-freshness] telegram send failed", err)
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const provided =
    req.nextUrl.searchParams.get("secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  try {
    const flagged: FlaggedItem[] = []
    const articleExpiredIds: string[] = []
    const articleReviewIds: string[] = []

    // ── 1. Articles: только те что попадают под правила ─────────────────────
    const allArticles = await db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        tenantId: knowledgeArticles.tenantId,
        reviewCycle: knowledgeArticles.reviewCycle,
        validUntil: knowledgeArticles.validUntil,
        updatedAt: knowledgeArticles.updatedAt,
      })
      .from(knowledgeArticles)
      .where(
        or(
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "1m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "3m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "6m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "12m")),
          and(isNotNull(knowledgeArticles.reviewCycle), eq(knowledgeArticles.reviewCycle, "1y")),
          isNotNull(knowledgeArticles.validUntil),
        ),
      )

    for (const a of allArticles) {
      const validUntil = a.validUntil ? new Date(a.validUntil) : null
      const updatedAt = a.updatedAt ? new Date(a.updatedAt) : null
      let reason: FlagReason | null = null

      if (validUntil && validUntil < now) {
        reason = "expired"
      } else if (validUntil && validUntil < in7Days) {
        reason = "review"
      } else if (a.reviewCycle && a.reviewCycle !== "none" && updatedAt) {
        const days = REVIEW_DAYS[a.reviewCycle]
        if (days) {
          const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
          if (updatedAt < threshold) reason = "review"
        }
      }

      if (reason) {
        flagged.push({
          id: a.id,
          type: "article",
          title: a.title,
          tenantId: a.tenantId,
          reason,
        })
        if (reason === "expired") articleExpiredIds.push(a.id)
        else articleReviewIds.push(a.id)
      }
    }

    // ── 2. Demo templates: нет колонки status, считаем только для отчёта ──
    const allDemos = await db
      .select({
        id: demoTemplates.id,
        name: demoTemplates.name,
        tenantId: demoTemplates.tenantId,
        reviewCycle: demoTemplates.reviewCycle,
        validUntil: demoTemplates.validUntil,
        updatedAt: demoTemplates.updatedAt,
      })
      .from(demoTemplates)
      .where(
        or(
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "1m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "3m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "6m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "12m")),
          and(isNotNull(demoTemplates.reviewCycle), eq(demoTemplates.reviewCycle, "1y")),
          isNotNull(demoTemplates.validUntil),
        ),
      )

    for (const d of allDemos) {
      if (!d.tenantId) continue
      const validUntil = d.validUntil ? new Date(d.validUntil) : null
      const updatedAt = d.updatedAt ? new Date(d.updatedAt) : null
      let reason: FlagReason | null = null

      if (validUntil && validUntil < now) {
        reason = "expired"
      } else if (validUntil && validUntil < in7Days) {
        reason = "review"
      } else if (d.reviewCycle && d.reviewCycle !== "none" && updatedAt) {
        const days = REVIEW_DAYS[d.reviewCycle]
        if (days) {
          const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
          if (updatedAt < threshold) reason = "review"
        }
      }

      if (reason) {
        flagged.push({
          id: d.id,
          type: "demo",
          title: d.name,
          tenantId: d.tenantId,
          reason,
        })
      }
    }

    // ── 3. Обновить status на knowledgeArticles ─────────────────────────────
    if (articleExpiredIds.length > 0) {
      await db
        .update(knowledgeArticles)
        .set({ status: "expired" })
        .where(inArray(knowledgeArticles.id, articleExpiredIds))
    }
    if (articleReviewIds.length > 0) {
      await db
        .update(knowledgeArticles)
        .set({ status: "review" })
        .where(inArray(knowledgeArticles.id, articleReviewIds))
    }

    // ── 4. Группировка по tenant и уведомления ──────────────────────────────
    const byTenant = new Map<string, FlaggedItem[]>()
    for (const item of flagged) {
      const arr = byTenant.get(item.tenantId) ?? []
      arr.push(item)
      byTenant.set(item.tenantId, arr)
    }

    let notified = 0
    const tenantIds = Array.from(byTenant.keys())
    if (tenantIds.length > 0) {
      const tenantCompanies = await db
        .select({
          id: companies.id,
          name: companies.name,
          telegramBotToken: companies.telegramBotToken,
        })
        .from(companies)
        .where(inArray(companies.id, tenantIds))

      for (const company of tenantCompanies) {
        const items = byTenant.get(company.id) ?? []
        if (items.length === 0) continue

        const expiredCount = items.filter((i) => i.reason === "expired").length
        const reviewCount = items.filter((i) => i.reason === "review").length

        // Найти получателей: director + hr_lead
        const recipients = await db
          .select({ id: users.id, role: users.role, telegramChatId: users.telegramChatId })
          .from(users)
          .where(
            and(
              eq(users.companyId, company.id),
              or(eq(users.role, "director"), eq(users.role, "hr_lead")),
            ),
          )

        if (recipients.length === 0) continue

        const title = "База знаний: материалы требуют внимания"
        const body =
          `Устаревших: ${expiredCount}, требуют проверки: ${reviewCount}. ` +
          `Всего материалов: ${items.length}.`

        // DB notifications — по одной на получателя
        for (const r of recipients) {
          await db.insert(notifications).values({
            tenantId: company.id,
            userId: r.id,
            type: "knowledge_freshness",
            title,
            body,
            severity: expiredCount > 0 ? "warning" : "info",
            sourceType: "knowledge_freshness",
            href: "/knowledge-v2/settings",
          })
        }

        // Telegram — только если у компании подключён бот и у получателя привязан chat_id
        if (company.telegramBotToken) {
          const preview = items
            .slice(0, 5)
            .map((i) => {
              const tag = i.reason === "expired" ? "🔴" : "🟡"
              const kind = i.type === "article" ? "статья" : "презентация"
              return `${tag} ${i.title} _(${kind})_`
            })
            .join("\n")
          const more = items.length > 5 ? `\n… и ещё ${items.length - 5}` : ""
          const text =
            `📚 *${title}*\n\n` +
            `Устаревших: *${expiredCount}*\n` +
            `На проверку: *${reviewCount}*\n\n` +
            `${preview}${more}`

          for (const r of recipients) {
            if (r.telegramChatId) {
              await sendTelegram(company.telegramBotToken, r.telegramChatId, text)
            }
          }
        }

        notified++
      }
    }

    const totalExpired = flagged.filter((i) => i.reason === "expired").length
    const totalReview = flagged.filter((i) => i.reason === "review").length

    return NextResponse.json({
      ok: true,
      checked: allArticles.length + allDemos.length,
      expired: totalExpired,
      review: totalReview,
      notified,
    })
  } catch (err) {
    console.error("[cron/knowledge-freshness]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
