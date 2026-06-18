import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, plans, integratorClients, integrators } from "@/lib/db/schema"
import {ilike, or, inArray, count, asc, desc, and, eq, isNull, isNotNull} from "drizzle-orm"
import {requirePlatformAdmin, apiSuccess} from "@/lib/api-helpers"

// Алиас companies для компании-партнёра (отдельный join, чтобы не конфликтовать
// с основной выборкой клиентских компаний).
import { alias } from "drizzle-orm/pg-core"

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
  const trashed = searchParams.get("trashed") === "true"
  const archived = searchParams.get("archived") === "true"
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

  // Корзина / архив / активные:
  //   ?trashed=true  → deleted_at IS NOT NULL (корзина)
  //   ?archived=true → archived_at IS NOT NULL AND deleted_at IS NULL (архив)
  //   по умолчанию   → archived_at IS NULL AND deleted_at IS NULL (активные)
  if (trashed) {
    conditions.push(isNotNull(companies.deletedAt))
  } else if (archived) {
    conditions.push(isNotNull(companies.archivedAt))
    conditions.push(isNull(companies.deletedAt))
  } else {
    conditions.push(isNull(companies.archivedAt))
    conditions.push(isNull(companies.deletedAt))
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

  // Счётчик архивных компаний (для таба «Архив» в UI)
  const [{ archivedCount }] = await db
    .select({ archivedCount: count() })
    .from(companies)
    .where(and(isNotNull(companies.archivedAt), isNull(companies.deletedAt)))

  // Данные компаний
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      inn: companies.inn,
      subscriptionStatus: companies.subscriptionStatus,
      trialEndsAt: companies.trialEndsAt,
      createdAt: companies.createdAt,
      archivedAt: companies.archivedAt,
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
      counts: { archived: Number(archivedCount) },
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

  // Партнёр компании (активная связь integrator_clients) → название и id партнёра.
  const partnerCompanies = alias(companies, "partner_companies")
  const partnerRows = await db
    .select({
      clientCompanyId:    integratorClients.clientCompanyId,
      partnerIntegratorId: integrators.id,
      partnerName:        partnerCompanies.name,
    })
    .from(integratorClients)
    .innerJoin(integrators, eq(integratorClients.integratorId, integrators.id))
    .leftJoin(partnerCompanies, eq(integrators.companyId, partnerCompanies.id))
    .where(and(
      inArray(integratorClients.clientCompanyId, companyIds),
      eq(integratorClients.status, "active"),
    ))
  const partnerMap = new Map(partnerRows.map(r => [r.clientCompanyId, r]))

  const data = rows.map(row => {
    const planId = row.currentPlanId ?? row.planId
    const plan = planId ? planMap.get(planId) : null
    const partner = partnerMap.get(row.id)
    return {
      ...row,
      userCount: Number(userCountMap.get(row.id) ?? 0),
      directorEmail: directorMap.get(row.id) ?? null,
      planName: plan?.name ?? null,
      planPrice: plan ? Math.round(plan.price / 100) : null,
      mrr: plan && row.subscriptionStatus === "active" ? Math.round(plan.price / 100) : 0,
      partnerName: partner?.partnerName ?? null,
      partnerIntegratorId: partner?.partnerIntegratorId ?? null,
      linkStatus: partner ? "active" : null,
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
    counts: { archived: Number(archivedCount) },
  })
}
