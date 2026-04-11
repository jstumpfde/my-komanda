import { NextRequest } from "next/server"
import { and, eq, gt, lt, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  learningAssignments,
  learningPlans,
  notifications,
  users,
} from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// GET  — таблица прогресса активных назначений тенанта (для 5-го accordion)
// POST — разослать напоминания по отстающим (manual trigger)

interface ProgressRow {
  assignmentId: string
  userId: string
  userName: string
  userEmail: string
  planId: string
  planTitle: string
  progress: number
  deadline: string | null
  status: "on_track" | "behind" | "overdue" | "completed"
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

async function loadProgress(tenantId: string) {
  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      assignmentId: learningAssignments.id,
      userId: learningAssignments.userId,
      userName: users.name,
      userEmail: users.email,
      planId: learningPlans.id,
      planTitle: learningPlans.title,
      planMaterials: learningPlans.materials,
      progress: learningAssignments.progress,
      deadline: learningAssignments.deadline,
      aStatus: learningAssignments.status,
    })
    .from(learningAssignments)
    .innerJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))
    .innerJoin(users, eq(users.id, learningAssignments.userId))
    .where(eq(learningAssignments.tenantId, tenantId))

  const items: ProgressRow[] = rows.map((r) => {
    const pct = progressPercent(r.progress, r.planMaterials)
    const deadline = r.deadline ? new Date(r.deadline) : null

    let status: ProgressRow["status"] = "on_track"
    if (r.aStatus === "completed") status = "completed"
    else if (deadline && deadline < now) status = "overdue"
    else if (deadline && deadline < in7Days && pct < 50) status = "behind"

    return {
      assignmentId: r.assignmentId,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      planId: r.planId,
      planTitle: r.planTitle,
      progress: pct,
      deadline: deadline ? deadline.toISOString() : null,
      status,
    }
  })

  const behind = items.filter((i) => i.status === "behind").length
  const overdue = items.filter((i) => i.status === "overdue").length
  const completed = items.filter((i) => i.status === "completed").length

  return {
    items,
    total: items.length,
    behind,
    overdue,
    completed,
  }
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const data = await loadProgress(user.companyId)
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
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
    console.error("[knowledge/progress] telegram failed", err)
  }
}

// POST — разослать напоминания отстающим и просроченным
export async function POST(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const now = new Date()

    const rows = await db
      .select({
        assignmentId: learningAssignments.id,
        userId: learningAssignments.userId,
        userName: users.name,
        userTelegramChatId: users.telegramChatId,
        deadline: learningAssignments.deadline,
        progress: learningAssignments.progress,
        aStatus: learningAssignments.status,
        planTitle: learningPlans.title,
        planMaterials: learningPlans.materials,
      })
      .from(learningAssignments)
      .innerJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))
      .innerJoin(users, eq(users.id, learningAssignments.userId))
      .where(
        and(
          eq(learningAssignments.tenantId, user.companyId),
          ne(learningAssignments.status, "completed"),
          or(
            lt(learningAssignments.deadline, now),
            gt(learningAssignments.deadline, now),
          ),
        ),
      )

    const [company] = await db
      .select({ token: companies.telegramBotToken })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    const token = company?.token ?? null

    let sent = 0
    for (const r of rows) {
      const pct = progressPercent(r.progress, r.planMaterials)
      const deadline = r.deadline ? new Date(r.deadline) : null
      const overdue = deadline && deadline < now
      const behind = deadline && !overdue && (deadline.getTime() - now.getTime()) < 7 * 24 * 60 * 60 * 1000 && pct < 50
      if (!overdue && !behind) continue

      const deadlineRu = deadline
        ? deadline.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })
        : "не указан"
      const title = overdue ? `Курс «${r.planTitle}» просрочен` : `Напоминание: курс «${r.planTitle}»`
      const body = overdue
        ? `Дедлайн был ${deadlineRu}. Прогресс: ${pct}%.`
        : `Осталось менее недели. Прогресс: ${pct}%. Дедлайн: ${deadlineRu}.`

      await db.insert(notifications).values({
        tenantId: user.companyId,
        userId: r.userId,
        type: overdue ? "knowledge_overdue" : "knowledge_reminder",
        title,
        body,
        severity: overdue ? "danger" : "warning",
        sourceType: "learning_assignment",
        sourceId: r.assignmentId,
        href: "/knowledge-v2/plans",
      })

      if (token && r.userTelegramChatId) {
        const text =
          `${overdue ? "🔴" : "⏰"} *${title}*\n\n` +
          `${r.userName}, ${body}`
        await sendTelegram(token, r.userTelegramChatId, text)
      }
      sent++
    }

    const summary = await loadProgress(user.companyId)
    return apiSuccess({ ok: true, sent, ...summary })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/progress] POST", err)
    return apiError("Internal server error", 500)
  }
}
