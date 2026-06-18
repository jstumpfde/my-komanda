import { NextRequest, NextResponse } from "next/server"
import { and, eq, gt, lt, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  learningAssignments,
  learningPlans,
  notifications,
  users,
} from "@/lib/db/schema"

import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "knowledge-reminders"

// POST /api/cron/knowledge-reminders — Protected by X-Cron-Secret header.
// Ежедневно: находит активные назначения с дедлайном < 3 дней
// и шлёт напоминание сотруднику (notification + Telegram).

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
    console.error("[cron/knowledge-reminders] telegram failed", err)
  }
}

function countRemainingLessons(progress: unknown, materials: unknown): number {
  const totalMaterials = Array.isArray(materials) ? materials.length : 0
  if (!progress || typeof progress !== "object") return totalMaterials
  const done = Object.values(progress as Record<string, unknown>).filter(
    (v) => v === true || (typeof v === "object" && v !== null && (v as { done?: boolean }).done === true),
  ).length
  return Math.max(0, totalMaterials - done)
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  const run = await startCronRun(CRON_NAME).catch(() => null)
  const now = new Date()
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  try {
    const rows = await db
      .select({
        assignmentId: learningAssignments.id,
        tenantId: learningAssignments.tenantId,
        userId: learningAssignments.userId,
        status: learningAssignments.status,
        deadline: learningAssignments.deadline,
        progress: learningAssignments.progress,
        planId: learningPlans.id,
        planTitle: learningPlans.title,
        planMaterials: learningPlans.materials,
        userName: users.name,
        userTelegramChatId: users.telegramChatId,
      })
      .from(learningAssignments)
      .innerJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))
      .innerJoin(users, eq(users.id, learningAssignments.userId))
      .where(
        and(
          or(
            eq(learningAssignments.status, "assigned"),
            eq(learningAssignments.status, "in_progress"),
          ),
          ne(learningAssignments.status, "completed"),
          gt(learningAssignments.deadline, now),
          lt(learningAssignments.deadline, in3Days),
        ),
      )

    // Cache tokens per tenant
    const tokenCache = new Map<string, string | null>()
    async function tenantToken(tenantId: string): Promise<string | null> {
      if (tokenCache.has(tenantId)) return tokenCache.get(tenantId)!
      const [c] = await db
        .select({ token: companies.telegramBotToken })
        .from(companies)
        .where(eq(companies.id, tenantId))
        .limit(1)
      const t = c?.token ?? null
      tokenCache.set(tenantId, t)
      return t
    }

    let reminded = 0
    let telegrams = 0

    for (const r of rows) {
      const remaining = countRemainingLessons(r.progress, r.planMaterials)
      const deadlineRu = r.deadline
        ? new Date(r.deadline).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "не указан"

      const title = `Напоминание: курс «${r.planTitle}»`
      const body = `Осталось ${remaining} ${lessonsPlural(remaining)}. Дедлайн: ${deadlineRu}.`

      await db.insert(notifications).values({
        tenantId: r.tenantId,
        userId: r.userId,
        type: "knowledge_reminder",
        title,
        body,
        severity: "warning",
        sourceType: "learning_assignment",
        sourceId: r.assignmentId,
        href: "/knowledge-v2/plans",
      })
      reminded++

      if (r.userTelegramChatId) {
        const token = await tenantToken(r.tenantId)
        if (token) {
          const text =
            `⏰ *${title}*\n\n` +
            `${r.userName}, у вас назначен курс *${r.planTitle}*.\n` +
            `Осталось: *${remaining} ${lessonsPlural(remaining)}*\n` +
            `📅 Дедлайн: *${deadlineRu}*`
          await sendTelegram(token, r.userTelegramChatId, text)
          telegrams++
        }
      }
    }

    if (run) await finishCronRun(run.id, "ok", { checked: rows.length, reminded, telegrams })
    return NextResponse.json({
      ok: true,
      checked: rows.length,
      reminded,
      telegrams,
      checkedAt: now.toISOString(),
    })
  } catch (err) {
    console.error("[cron/knowledge-reminders]", err)
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

function lessonsPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "урок"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "урока"
  return "уроков"
}
