import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, plans } from "@/lib/db/schema"
import { eq, ilike, or, inArray, count, asc, desc, and } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/clients
// Query params:
//   ?search=   — поиск по названию компании, ИНН или email пользователя
//   ?status=trial,active,expired — фильтр по subscription_status (через запятую)
//   ?page=1&limit=20 — пагинация
//   ?sort=name|created_at|mrr — сортировка
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get("search")?.trim() ?? ""
  const statusParam = searchParams.get("status") ?? ""
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  const sort = searchParams.get("sort") ?? "created_at"
  const offset = (page - 1) * limit

  const statuses = statusParam ? statusParam.split(",").filter(Boolean) : []

  // Ищем компании по email пользователей
  let companyIdsFromEmail: string[] = []
  if (search) {
    const emailMatches = await db
      .select({ companyId: users.companyId })
      .from(users)
      .where(ilike(users.email, `%${search}%`))
    companyIdsFromEmail = emailMatches
      .map(r => r.companyId)
      .filter((id): id is string => id !== null)
  }

  // Строим условия WHERE
  const conditions = []

  if (search) {
    const nameOrInn = or(
      ilike(companies.name, `%${search}%`),
      ilike(companies.inn, `%${search}%`),
      ...(companyIdsFromEmail.length > 0 ? [inArray(companies.id, companyIdsFromEmail)] : [])
    )
    if (nameOrInn) conditions.push(nameOrInn)
  }

  if (statuses.length > 0) {
    conditions.push(inArray(companies.subscriptionStatus, statuses))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Сортировка
  let orderBy
  if (sort === "name") {
    orderBy = asc(companies.name)
  } else {
    orderBy = desc(companies.createdAt)
  }

  // Всего записей
  const [{ total }] = await db
    .select({ total: count() })
    .from(companies)
    .where(whereClause)

  // Данные компаний
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      inn: companies.inn,
      subscriptionStatus: companies.subscriptionStatus,
      trialEndsAt: companies.trialEndsAt,
      createdAt: companies.createdAt,
      planId: companies.planId,
      currentPlanId: companies.currentPlanId,
    })
    .from(companies)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  if (rows.length === 0) {
    return apiSuccess({
      data: [],
      total: Number(total),
      page,
      totalPages: Math.ceil(Number(total) / limit),
    })
  }

  const companyIds = rows.map(r => r.id)

  // Количество пользователей по каждой компании
  const userCounts = await db
    .select({ companyId: users.companyId, cnt: count() })
    .from(users)
    .where(inArray(users.companyId, companyIds))
    .groupBy(users.companyId)

  const userCountMap = new Map(userCounts.map(r => [r.companyId, r.cnt]))

  // Email директора компании
  const directorRows = await db
    .select({ companyId: users.companyId, email: users.email })
    .from(users)
    .where(
      and(
        inArray(users.companyId, companyIds),
        inArray(users.role, ["director", "admin"])
      )
    )

  const directorMap = new Map(directorRows.map(r => [r.companyId, r.email]))

  // Планы
  const planIds = [...new Set(
    rows.map(r => r.currentPlanId ?? r.planId).filter(Boolean) as string[]
  )]
  const planRows = planIds.length > 0
    ? await db
        .select({ id: plans.id, name: plans.name, price: plans.price })
        .from(plans)
        .where(inArray(plans.id, planIds))
    : []
  const planMap = new Map(planRows.map(p => [p.id, p]))

  const data = rows.map(row => {
    const planId = row.currentPlanId ?? row.planId
    const plan = planId ? planMap.get(planId) : null
    return {
      ...row,
      userCount: Number(userCountMap.get(row.id) ?? 0),
      directorEmail: directorMap.get(row.id) ?? null,
      planName: plan?.name ?? null,
      planPrice: plan ? Math.round(plan.price / 100) : null,
      mrr: plan && row.subscriptionStatus === "active" ? Math.round(plan.price / 100) : 0,
    }
  })

  // Для сортировки по MRR — пересортируем в памяти
  if (sort === "mrr") {
    data.sort((a, b) => b.mrr - a.mrr)
  }

  return apiSuccess({
    data,
    total: Number(total),
    page,
    totalPages: Math.ceil(Number(total) / limit),
  })
}
