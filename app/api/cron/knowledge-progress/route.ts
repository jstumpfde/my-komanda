import { NextRequest, NextResponse } from "next/server"
import { and, eq, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  learningAssignments,
  learningPlans,
  notifications,
  users,
} from "@/lib/db/schema"

// GET /api/cron/knowledge-progress?secret=CRON_SECRET
// Weekly: для каждого тенанта — сводка по прогрессу обучения (завершили /
// отстают / просрочили). Уведомление директору + hr_lead через notifications
// + Telegram.

interface Stats {
  completed: number
  behind: number
  overdue: number
  total: number
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
    console.error("[cron/knowledge-progress] telegram failed", err)
  }
}

function progressPercent(progress: unknown, materials: unknown): number {
  const total = Array.isArray(materials) ? materials.length : 0
  if (total === 0) return 0
  if (!progress || typeof progress !== "object") return 0
  const done = Object.values(progress as Record<string, unknown>).filter(
    (v) => v === true || (typeof v === "object" && v !== null && (v as { done?: boolean }).done === true),
  ).length
  return Math.round((done / total) * 100)
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
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  try {
    // Забираем все незавершённые назначения + те что завершились за последнюю неделю
    const rows = await db
      .select({
        assignmentId: learningAssignments.id,
        tenantId: learningAssignments.tenantId,
        userId: learningAssignments.userId,
        status: learningAssignments.status,
        deadline: learningAssignments.deadline,
        completedAt: learningAssignments.completedAt,
        progress: learningAssignments.progress,
        planTitle: learningPlans.title,
        planMaterials: learningPlans.materials,
      })
      .from(learningAssignments)
      .innerJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))

    const statsByTenant = new Map<string, Stats>()

    for (const r of rows) {
      const st = statsByTenant.get(r.tenantId) ?? { completed: 0, behind: 0, overdue: 0, total: 0 }
      st.total++

      if (r.status === "completed") {
        if (r.completedAt && new Date(r.completedAt) >= weekAgo) st.completed++
      } else {
        const deadlineDate = r.deadline ? new Date(r.deadline) : null
        if (deadlineDate && deadlineDate < now) {
          st.overdue++
        } else if (deadlineDate && deadlineDate < in7Days) {
          const pct = progressPercent(r.progress, r.planMaterials)
          if (pct < 50) st.behind++
        }
      }

      statsByTenant.set(r.tenantId, st)
    }

    // Totals для возврата
    let totCompleted = 0
    let totBehind = 0
    let totOverdue = 0
    let notified = 0

    for (const [tenantId, st] of statsByTenant) {
      totCompleted += st.completed
      totBehind += st.behind
      totOverdue += st.overdue

      if (st.completed === 0 && st.behind === 0 && st.overdue === 0) continue

      const [company] = await db
        .select({ id: companies.id, token: companies.telegramBotToken, name: companies.name })
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

      const title = "Еженедельный отчёт обучения"
      const body =
        `Завершили: ${st.completed}, отстают: ${st.behind}, просрочили: ${st.overdue}. ` +
        `Всего активных назначений: ${st.total}.`

      for (const r of recipients) {
        await db.insert(notifications).values({
          tenantId,
          userId: r.id,
          type: "knowledge_progress_weekly",
          title,
          body,
          severity: st.overdue > 0 ? "warning" : "info",
          sourceType: "learning_assignment",
          href: "/knowledge-v2/settings",
        })
      }

      if (company.token) {
        const text =
          `📊 *${title}*\n\n` +
          `✅ Завершили: *${st.completed}*\n` +
          `⚠️ Отстают: *${st.behind}*\n` +
          `🔴 Просрочили: *${st.overdue}*\n\n` +
          `_Всего активных назначений: ${st.total}_`
        for (const r of recipients) {
          if (r.telegramChatId) {
            await sendTelegram(company.token, r.telegramChatId, text)
          }
        }
      }

      notified++
    }

    return NextResponse.json({
      ok: true,
      tenants: statsByTenant.size,
      completed: totCompleted,
      behind: totBehind,
      overdue: totOverdue,
      notified,
      checkedAt: now.toISOString(),
    })
  } catch (err) {
    console.error("[cron/knowledge-progress]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

