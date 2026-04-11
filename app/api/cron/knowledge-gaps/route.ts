import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, gte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  knowledgeQuestionLogs,
  notifications,
  users,
} from "@/lib/db/schema"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

// GET /api/cron/knowledge-gaps?secret=CRON_SECRET
// Weekly: для каждого тенанта находит топ-10 неотвеченных вопросов за 7 дней,
// просит Claude порекомендовать какие материалы создать, и отправляет сводку
// директору/hr_lead через notifications + Telegram.

interface GroupedGap {
  questionKey: string
  sample: string
  count: number
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
    console.error("[cron/knowledge-gaps] telegram failed", err)
  }
}

async function askClaudeRecommendations(
  companyName: string,
  gaps: GroupedGap[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const list = gaps
    .map((g, i) => `${i + 1}. «${g.sample}» — запрошено ${g.count} раз`)
    .join("\n")

  const prompt =
    `Компания «${companyName}» собрала вопросы сотрудников к базе знаний за неделю, ` +
    `на которые база не смогла ответить. Проанализируй список и предложи 3-5 конкретных ` +
    `материалов (регламенты, инструкции, FAQ, статьи), которые стоит создать в первую очередь. ` +
    `Для каждого укажи: название документа, тип, и 1 предложение зачем он нужен. ` +
    `Ответ на русском, кратко, маркированным списком.\n\n` +
    `Неотвеченные вопросы:\n${list}`

  try {
    const res = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!res.ok) {
      console.error("[cron/knowledge-gaps] Claude", res.status)
      return null
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    return data.content?.find((c) => c.type === "text")?.text?.trim() ?? null
  } catch (err) {
    console.error("[cron/knowledge-gaps] Claude fetch failed", err)
    return null
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

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  try {
    // ── Группировка неотвеченных по questionKey, по тенантам ──────────────
    const rows = await db
      .select({
        tenantId: knowledgeQuestionLogs.tenantId,
        questionKey: knowledgeQuestionLogs.questionKey,
        sample: sql<string>`max(${knowledgeQuestionLogs.question})`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(knowledgeQuestionLogs)
      .where(
        and(
          eq(knowledgeQuestionLogs.answered, false),
          gte(knowledgeQuestionLogs.createdAt, since),
        ),
      )
      .groupBy(knowledgeQuestionLogs.tenantId, knowledgeQuestionLogs.questionKey)
      .orderBy(desc(sql`count(*)`))

    // Группировка по тенантам в памяти
    const byTenant = new Map<string, GroupedGap[]>()
    for (const r of rows) {
      if (!r.questionKey || !r.sample) continue
      const arr = byTenant.get(r.tenantId) ?? []
      if (arr.length < 10) {
        arr.push({ questionKey: r.questionKey, sample: r.sample, count: Number(r.cnt) })
      }
      byTenant.set(r.tenantId, arr)
    }

    let notified = 0
    const tenantIds = Array.from(byTenant.keys())

    for (const tenantId of tenantIds) {
      const gaps = byTenant.get(tenantId) ?? []
      if (gaps.length === 0) continue

      const [company] = await db
        .select({
          id: companies.id,
          name: companies.name,
          token: companies.telegramBotToken,
        })
        .from(companies)
        .where(eq(companies.id, tenantId))
        .limit(1)

      if (!company) continue

      const recipients = await db
        .select({ id: users.id, telegramChatId: users.telegramChatId })
        .from(users)
        .where(
          and(
            eq(users.companyId, tenantId),
            or(eq(users.role, "director"), eq(users.role, "hr_lead")),
          ),
        )

      if (recipients.length === 0) continue

      const recommendations = await askClaudeRecommendations(company.name, gaps)

      const title = "Еженедельный аудит базы знаний"
      const topList = gaps
        .slice(0, 5)
        .map((g, i) => `${i + 1}. «${g.sample}» × ${g.count}`)
        .join("\n")
      const body =
        `За неделю ${gaps.reduce((s, g) => s + g.count, 0)} неотвеченных вопросов. ` +
        `Топ-${Math.min(5, gaps.length)}:\n${topList}` +
        (recommendations ? `\n\nРекомендации AI:\n${recommendations}` : "")

      // DB notifications
      for (const r of recipients) {
        await db.insert(notifications).values({
          tenantId,
          userId: r.id,
          type: "knowledge_gaps_weekly",
          title,
          body,
          severity: "info",
          sourceType: "knowledge_question_log",
          href: "/knowledge-v2/settings",
        })
      }

      // Telegram
      if (company.token) {
        const tgText =
          `📊 *${title}*\n\n` +
          `Неотвеченных вопросов: *${gaps.reduce((s, g) => s + g.count, 0)}*\n\n` +
          `*Топ запросов:*\n${topList}` +
          (recommendations ? `\n\n*💡 AI рекомендует создать:*\n${recommendations}` : "")
        for (const r of recipients) {
          if (r.telegramChatId) {
            await sendTelegram(company.token, r.telegramChatId, tgText)
          }
        }
      }

      notified++
    }

    return NextResponse.json({
      ok: true,
      tenants: tenantIds.length,
      notified,
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[cron/knowledge-gaps]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
