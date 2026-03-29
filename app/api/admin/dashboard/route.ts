import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, plans } from "@/lib/db/schema"
import { eq, count, sql, and, lt, gte, inArray } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/dashboard — метрики для дашборда администратора
export async function GET(_req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  // Общее число компаний
  const [{ totalCompanies }] = await db
    .select({ totalCompanies: count() })
    .from(companies)

  // Активные подписки
  const [{ activeSubscriptions }] = await db
    .select({ activeSubscriptions: count() })
    .from(companies)
    .where(eq(companies.subscriptionStatus, "active"))

  // Всего пользователей
  const [{ totalUsers }] = await db
    .select({ totalUsers: count() })
    .from(users)

  // MRR — сумма цен планов для активных компаний
  const activeCompanies = await db
    .select({ planId: companies.planId, currentPlanId: companies.currentPlanId })
    .from(companies)
    .where(eq(companies.subscriptionStatus, "active"))

  const planIds = [...new Set(
    activeCompanies
      .map(c => c.currentPlanId ?? c.planId)
      .filter(Boolean) as string[]
  )]

  let mrr = 0
  if (planIds.length > 0) {
    const planPrices = await db
      .select({ id: plans.id, price: plans.price })
      .from(plans)
      .where(inArray(plans.id, planIds))

    const planPriceMap = new Map(planPrices.map(p => [p.id, p.price]))

    for (const c of activeCompanies) {
      const planId = c.currentPlanId ?? c.planId
      if (planId) {
        const price = planPriceMap.get(planId) ?? 0
        mrr += price
      }
    }
    // Конвертируем из копеек в рубли
    mrr = Math.round(mrr / 100)
  }

  // Регистрации по месяцам (последние 6 месяцев)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const registrationsByMonthRaw = await db
    .select({
      month: sql<string>`to_char(${companies.createdAt}, 'YYYY-MM')`,
      count: count(),
    })
    .from(companies)
    .where(gte(companies.createdAt, sixMonthsAgo))
    .groupBy(sql`to_char(${companies.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${companies.createdAt}, 'YYYY-MM')`)

  // Формируем полный список последних 6 месяцев (включая пустые)
  const months: { month: string; count: number; label: string }[] = []
  const MONTH_NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
  const countMap = new Map(registrationsByMonthRaw.map(r => [r.month, Number(r.count)]))

  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    months.push({
      month: key,
      count: countMap.get(key) ?? 0,
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    })
  }

  // Последние 5 регистраций
  const recentRegistrations = await db
    .select({
      id: companies.id,
      name: companies.name,
      subscriptionStatus: companies.subscriptionStatus,
      createdAt: companies.createdAt,
      planId: companies.planId,
      currentPlanId: companies.currentPlanId,
    })
    .from(companies)
    .orderBy(sql`${companies.createdAt} desc`)
    .limit(5)

  // Обогащаем с названием плана
  const recentPlanIds = [...new Set(
    recentRegistrations.map(c => c.currentPlanId ?? c.planId).filter(Boolean) as string[]
  )]
  const recentPlans = recentPlanIds.length > 0
    ? await db.select({ id: plans.id, name: plans.name }).from(plans).where(inArray(plans.id, recentPlanIds))
    : []
  const recentPlanMap = new Map(recentPlans.map(p => [p.id, p.name]))

  const recentRegistrationsEnriched = recentRegistrations.map(c => ({
    id: c.id,
    name: c.name,
    subscriptionStatus: c.subscriptionStatus,
    createdAt: c.createdAt,
    planName: recentPlanMap.get(c.currentPlanId ?? c.planId ?? "") ?? null,
  }))

  // Trial-аккаунты, истекающие в ближайшие 3 дня
  const now = new Date()
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const expiringTrials = await db
    .select({
      id: companies.id,
      name: companies.name,
      trialEndsAt: companies.trialEndsAt,
    })
    .from(companies)
    .where(
      and(
        eq(companies.subscriptionStatus, "trial"),
        gte(companies.trialEndsAt, now),
        lt(companies.trialEndsAt, threeDaysLater)
      )
    )
    .orderBy(companies.trialEndsAt)
    .limit(20)

  const expiringTrialsEnriched = expiringTrials.map(c => {
    const endsAt = c.trialEndsAt ? new Date(c.trialEndsAt) : null
    const daysLeft = endsAt
      ? Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null
    return { id: c.id, name: c.name, trialEndsAt: c.trialEndsAt, daysLeft }
  })

  return apiSuccess({
    totalCompanies: Number(totalCompanies),
    activeSubscriptions: Number(activeSubscriptions),
    totalUsers: Number(totalUsers),
    mrr,
    registrationsByMonth: months,
    recentRegistrations: recentRegistrationsEnriched,
    expiringTrials: expiringTrialsEnriched,
  })
}
