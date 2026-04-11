import { and, eq, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  learningAssignments,
  learningPlans,
  notifications,
  users,
} from "@/lib/db/schema"

// Onboarding trigger: когда новый сотрудник попадает в компанию (join-code /
// accept-invite), мы:
//  1. Подбираем learning_plans по должности (match по title / description)
//  2. Создаём learning_assignments со сроком +30 дней
//  3. Отправляем notifications для HR-lead + director
//  4. Если у компании подключён Telegram-бот и у сотрудника есть chat_id —
//     шлём приветствие в Telegram

const DEFAULT_DEADLINE_DAYS = 30

function positionKeywords(position: string | null | undefined): string[] {
  if (!position) return []
  return position
    .toLowerCase()
    .split(/[\s,./-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
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
    console.error("[onboarding] telegram send failed", err)
  }
}

export interface OnboardingResult {
  assigned: { planId: string; planTitle: string }[]
  skipped: "no_position" | "no_matching_plan" | null
}

export async function triggerOnboarding(
  tenantId: string,
  userId: string,
  options: { specificPlanId?: string } = {},
): Promise<OnboardingResult> {
  const result: OnboardingResult = { assigned: [], skipped: null }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      position: users.position,
      telegramChatId: users.telegramChatId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return result

  let plansToAssign: { id: string; title: string }[] = []

  if (options.specificPlanId) {
    const [plan] = await db
      .select({ id: learningPlans.id, title: learningPlans.title })
      .from(learningPlans)
      .where(
        and(eq(learningPlans.id, options.specificPlanId), eq(learningPlans.tenantId, tenantId)),
      )
      .limit(1)
    if (plan) plansToAssign = [plan]
  } else {
    const keywords = positionKeywords(user.position)
    if (keywords.length === 0) {
      result.skipped = "no_position"
      return result
    }

    const tenantPlans = await db
      .select({
        id: learningPlans.id,
        title: learningPlans.title,
        description: learningPlans.description,
      })
      .from(learningPlans)
      .where(eq(learningPlans.tenantId, tenantId))

    plansToAssign = tenantPlans
      .filter((p) => {
        const haystack = `${p.title} ${p.description ?? ""}`.toLowerCase()
        return keywords.some((k) => haystack.includes(k))
      })
      .map((p) => ({ id: p.id, title: p.title }))
      .slice(0, 5)
  }

  if (plansToAssign.length === 0) {
    if (!result.skipped) result.skipped = "no_matching_plan"
    return result
  }

  // Не дублировать существующие назначения для этого юзера
  const existing = await db
    .select({ planId: learningAssignments.planId })
    .from(learningAssignments)
    .where(eq(learningAssignments.userId, userId))
  const existingSet = new Set(existing.map((e) => e.planId))

  const deadline = new Date(Date.now() + DEFAULT_DEADLINE_DAYS * 24 * 60 * 60 * 1000)

  for (const plan of plansToAssign) {
    if (existingSet.has(plan.id)) continue
    try {
      await db.insert(learningAssignments).values({
        tenantId,
        planId: plan.id,
        userId,
        status: "assigned",
        progress: {},
        deadline,
      })
      result.assigned.push({ planId: plan.id, planTitle: plan.title })
    } catch (err) {
      console.error("[onboarding] assignment insert failed", err)
    }
  }

  if (result.assigned.length === 0) return result

  // ── Уведомления HR team ────────────────────────────────────────────────
  try {
    const hrRecipients = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.companyId, tenantId),
          or(eq(users.role, "director"), eq(users.role, "hr_lead"), eq(users.role, "hr_manager")),
        ),
      )

    const planNames = result.assigned.map((a) => `«${a.planTitle}»`).join(", ")
    const title = "Новому сотруднику назначен план обучения"
    const body = `${user.name} получил(а) план обучения: ${planNames}`

    for (const r of hrRecipients) {
      await db.insert(notifications).values({
        tenantId,
        userId: r.id,
        type: "knowledge_onboarding",
        title,
        body,
        severity: "info",
        sourceType: "learning_assignment",
        sourceId: userId,
        href: "/knowledge-v2/settings",
      })
    }
  } catch (err) {
    console.error("[onboarding] notification failed", err)
  }

  // ── Telegram приветствие сотруднику ────────────────────────────────────
  try {
    const [company] = await db
      .select({ token: companies.telegramBotToken, name: companies.name })
      .from(companies)
      .where(eq(companies.id, tenantId))
      .limit(1)

    if (company?.token && user.telegramChatId) {
      const planList = result.assigned
        .map((a, i) => `${i + 1}. *${a.planTitle}*`)
        .join("\n")
      const deadlineRu = deadline.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      const text =
        `👋 Добро пожаловать в *${company.name}*!\n\n` +
        `Вам назначен план обучения:\n${planList}\n\n` +
        `📅 Дедлайн: *${deadlineRu}*\n\n` +
        `Открыть базу знаний: /ask как начать обучение`
      await sendTelegram(company.token, user.telegramChatId, text)
    }
  } catch (err) {
    console.error("[onboarding] telegram welcome failed", err)
  }

  return result
}

// Count active assignments (not completed, not archived) for a user.
export async function countActiveAssignments(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(learningAssignments)
    .where(
      and(
        eq(learningAssignments.userId, userId),
        or(
          eq(learningAssignments.status, "assigned"),
          eq(learningAssignments.status, "in_progress"),
        ),
      ),
    )
  return row?.value ?? 0
}

// Match learning plans by user position — exported for the manual API to
// preview what would be auto-assigned.
export async function matchPlansForPosition(
  tenantId: string,
  position: string | null | undefined,
): Promise<{ id: string; title: string }[]> {
  const keywords = positionKeywords(position)
  if (keywords.length === 0) return []
  const tenantPlans = await db
    .select({
      id: learningPlans.id,
      title: learningPlans.title,
      description: learningPlans.description,
    })
    .from(learningPlans)
    .where(eq(learningPlans.tenantId, tenantId))
  return tenantPlans
    .filter((p) => {
      const hay = `${p.title} ${p.description ?? ""}`.toLowerCase()
      return keywords.some((k) => hay.includes(k))
    })
    .map((p) => ({ id: p.id, title: p.title }))
}

