import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { accessRequests } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"
import { apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/access-requests/[id]
//   body: { status: "contacted" | "rejected" }
//
// Сменить статус заявки на регистрацию. Одобрение (создание компании +
// директора) — отдельный эндпоинт .../approve. Сюда пускаем только
// «лёгкие» переходы статуса.
const ALLOWED_STATUSES = new Set(["contacted", "rejected", "new"])

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return apiError("Unauthorized", 401)
  }

  const { id } = await params

  let body: { status?: unknown }
  try { body = await req.json() } catch { return apiError("Некорректный JSON", 400) }
  const status = body.status
  if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
    return apiError("status должен быть 'contacted', 'rejected' или 'new'", 400)
  }

  try {
    const [reqRow] = await db
      .select({ id: accessRequests.id, status: accessRequests.status })
      .from(accessRequests)
      .where(eq(accessRequests.id, id))
      .limit(1)
    if (!reqRow) return apiError("Заявка не найдена", 404)
    if (reqRow.status === "approved") {
      return apiError("Заявка уже одобрена — сменить статус нельзя", 400)
    }

    await db.update(accessRequests).set({ status }).where(eq(accessRequests.id, id))
    return apiSuccess({ ok: true, status })
  } catch (err) {
    console.error("[admin/access-requests PATCH]", err)
    return apiError("Internal server error", 500)
  }
}
