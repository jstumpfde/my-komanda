import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { integratorClients, integrators, companies } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAdminPanelAccess } from "@/lib/platform/auth"

// GET /api/admin/integrators/[id]/clients — клиенты партнёра.
// Возвращаем status, чтобы UI мог показать/отфильтровать отменённые связи.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const rows = await db
    .select({
      id:              integratorClients.id,
      integratorId:    integratorClients.integratorId,
      clientCompanyId: integratorClients.clientCompanyId,
      status:          integratorClients.status,
      referredAt:      integratorClients.referredAt,
      companyName:     companies.name,
    })
    .from(integratorClients)
    .leftJoin(companies, eq(integratorClients.clientCompanyId, companies.id))
    .where(eq(integratorClients.integratorId, id))

  return apiSuccess({ clients: rows })
}

// POST /api/admin/integrators/[id]/clients — привязать компанию-клиента к партнёру.
// Body: { clientCompanyId: string, reassign?: boolean }
// - воскрешает отменённую связь (onConflictDoUpdate по UNIQUE(integratorId, clientCompanyId));
// - 409, если компания уже активно привязана к ДРУГОМУ партнёру (кроме reassign:true,
//   тогда старую связь отменяем в транзакции и создаём новую).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user
  try {
    user = await requireAdminPanelAccess()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    clientCompanyId?: unknown
    reassign?: unknown
  }
  const clientCompanyId = typeof body.clientCompanyId === "string" ? body.clientCompanyId.trim() : ""
  const reassign = body.reassign === true

  if (!clientCompanyId) return apiError("Укажите компанию-клиента", 400)

  // Партнёр существует?
  const [integrator] = await db
    .select({ id: integrators.id })
    .from(integrators)
    .where(eq(integrators.id, id))
    .limit(1)
  if (!integrator) return apiError("Партнёр не найден", 404)

  // Компания существует?
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, clientCompanyId))
    .limit(1)
  if (!company) return apiError("Компания не найдена", 404)

  // Активная связь с ДРУГИМ партнёром?
  const [otherActive] = await db
    .select({ id: integratorClients.id, integratorId: integratorClients.integratorId })
    .from(integratorClients)
    .where(and(
      eq(integratorClients.clientCompanyId, clientCompanyId),
      eq(integratorClients.status, "active"),
      ne(integratorClients.integratorId, id),
    ))
    .limit(1)

  if (otherActive && !reassign) {
    return apiError("Компания уже привязана к другому партнёру. Чтобы сменить — используйте перепривязку.", 409)
  }

  const created = await db.transaction(async (tx) => {
    // Перепривязка: отменяем все активные связи компании с другими партнёрами.
    if (otherActive && reassign) {
      await tx
        .update(integratorClients)
        .set({ status: "cancelled" })
        .where(and(
          eq(integratorClients.clientCompanyId, clientCompanyId),
          eq(integratorClients.status, "active"),
          ne(integratorClients.integratorId, id),
        ))
    }

    // Вставка/воскрешение: при повторе (UNIQUE integratorId+clientCompanyId)
    // не падаем 500, а обновляем status→active и автора привязки.
    const [row] = await tx
      .insert(integratorClients)
      .values({
        integratorId: id,
        clientCompanyId,
        onboardedByUserId: user.id,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [integratorClients.integratorId, integratorClients.clientCompanyId],
        set: { status: "active", onboardedByUserId: user.id },
      })
      .returning()
    return row
  })

  return apiSuccess({ client: created }, 201)
}
