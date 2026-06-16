import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users, companies } from "@/lib/db/schema"
import { ilike, or, eq, count, asc, desc, and, inArray, isNull, isNotNull } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAdminPanelAccess } from "@/lib/platform/auth"
import {
  accessTypeToUserRole, isAccessType, syncIntegratorForAccessType,
} from "@/lib/admin/assign-role"

// GET /api/admin/users — cross-tenant список всех пользователей платформы.
// Query params:
//   ?search=    — поиск по имени или email
//   ?companyId= — фильтр по компании
//   ?role=      — фильтр по роли
//   ?status=active|blocked — фильтр по is_active
//   ?page=1&limit=20 — пагинация
//   ?sort=name|created_at|email — сортировка
export async function GET(req: NextRequest) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { searchParams } = req.nextUrl

  // ?companiesList=true — лёгкий список компаний (id+name) для селекта в диалогах
  // создания/правки пользователя. Только активные (deleted_at IS NULL).
  if (searchParams.get("companiesList") === "true") {
    const list = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(isNull(companies.deletedAt))
      .orderBy(asc(companies.name))
    return apiSuccess({ companies: list })
  }

  const search = searchParams.get("search")?.trim() ?? ""
  const companyId = searchParams.get("companyId")?.trim() ?? ""
  const role = searchParams.get("role")?.trim() ?? ""
  const status = searchParams.get("status")?.trim() ?? ""
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  const sort = searchParams.get("sort") ?? "created_at"
  const offset = (page - 1) * limit

  // Поиск по названию компании → ищем подходящие companyId
  let companyIdsFromName: string[] = []
  if (search) {
    const matches = await db
      .select({ id: companies.id })
      .from(companies)
      .where(ilike(companies.name, `%${search}%`))
    companyIdsFromName = matches.map(r => r.id)
  }

  const conditions = []

  if (search) {
    const cond = or(
      ilike(users.name, `%${search}%`),
      ilike(users.email, `%${search}%`),
      ...(companyIdsFromName.length > 0 ? [inArray(users.companyId, companyIdsFromName)] : []),
    )
    if (cond) conditions.push(cond)
  }
  if (companyId) conditions.push(eq(users.companyId, companyId))
  if (role) conditions.push(eq(users.role, role))
  if (status === "active") conditions.push(eq(users.isActive, true))
  if (status === "blocked") conditions.push(eq(users.isActive, false))

  // Корзина: по умолчанию активные (deleted_at IS NULL); ?trashed=true — корзина.
  const trashed = searchParams.get("trashed") === "true"
  conditions.push(trashed ? isNotNull(users.deletedAt) : isNull(users.deletedAt))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  let orderBy
  if (sort === "name") orderBy = asc(users.name)
  else if (sort === "email") orderBy = asc(users.email)
  else orderBy = desc(users.createdAt)

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(whereClause)

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      companyId: users.companyId,
      isActive: users.isActive,
      position: users.position,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  // Подтягиваем названия компаний
  const companyIds = [...new Set(rows.map(r => r.companyId).filter((id): id is string => !!id))]
  const companyRows = companyIds.length > 0
    ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds))
    : []
  const companyMap = new Map(companyRows.map(c => [c.id, c.name]))

  const data = rows.map(r => ({
    ...r,
    companyName: r.companyId ? (companyMap.get(r.companyId) ?? null) : null,
  }))

  return apiSuccess({
    data,
    total: Number(total),
    page,
    totalPages: Math.ceil(Number(total) / limit),
  })
}

// POST /api/admin/users — создать пользователя (cross-tenant).
// Body: { email, name, password, role (accessType), companyId?, firstName? }
// role принимает как клиентские роли, так и партнёрские типы доступа
// (partner/sub_partner/referral) — последние раскладываются в
// users.role='partner' + запись в integrators (см. lib/admin/assign-role.ts).
export async function POST(req: NextRequest) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const body = await req.json().catch(() => ({}))
  const {
    email: rawEmail, name: rawName, password,
    role: accessType, companyId: rawCompanyId, firstName,
  } = body as {
    email?: string; name?: string; password?: string
    role?: string; companyId?: string; firstName?: string
  }

  const email = (rawEmail ?? "").trim().toLowerCase()
  const name = (rawName ?? "").trim()
  const companyId = (rawCompanyId ?? "").trim() || null

  if (!email || !email.includes("@")) return apiError("Укажите корректный email", 400)
  if (!name) return apiError("Укажите имя", 400)
  if (!password || password.length < 6) return apiError("Пароль не короче 6 символов", 400)
  if (!isAccessType(accessType)) return apiError("Недопустимый тип доступа", 400)

  // Уникальность email.
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) return apiError("Пользователь с таким email уже существует", 409)

  // Если задана компания — проверим, что существует.
  if (companyId) {
    const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1)
    if (!c) return apiError("Компания не найдена", 404)
  }

  const userRole = accessTypeToUserRole(accessType)

  // Партнёрский тип требует компанию (integrator привязан к companyId).
  try {
    await syncIntegratorForAccessType(accessType, companyId)
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Не удалось назначить партнёрский доступ", 400)
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name,
      firstName: firstName?.trim() || null,
      passwordHash: bcrypt.hashSync(password, 10),
      role: userRole,
      companyId,
    })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role, companyId: users.companyId })

  return apiSuccess(created, 201)
}
