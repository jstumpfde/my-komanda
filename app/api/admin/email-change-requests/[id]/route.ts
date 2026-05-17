import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { supportRequests, users } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/email-change-requests/[id]
//   body: { action: "approve" | "reject" }
//
// approve: подменяем users.email на data.newEmail и помечаем заявку 'done'.
// reject:  просто 'rejected'.
// Обе операции идемпотентны на уровне статуса: повтор после 'done' даёт 400.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  let body: { action?: unknown }
  try { body = await req.json() } catch { return apiError("Некорректный JSON", 400) }
  const action = body.action
  if (action !== "approve" && action !== "reject") {
    return apiError("action должен быть 'approve' или 'reject'", 400)
  }

  try {
    const [reqRow] = await db
      .select()
      .from(supportRequests)
      .where(eq(supportRequests.id, id))
      .limit(1)
    if (!reqRow) return apiError("Запрос не найден", 404)
    if (reqRow.type !== "email_change") return apiError("Запрос не на смену email", 400)
    if (reqRow.status !== "new") return apiError(`Запрос уже обработан (статус: ${reqRow.status})`, 400)

    if (action === "reject") {
      await db.update(supportRequests).set({ status: "rejected" }).where(eq(supportRequests.id, id))
      return apiSuccess({ ok: true, status: "rejected" })
    }

    // approve
    const data = reqRow.data as { newEmail?: string } | null
    const newEmail = typeof data?.newEmail === "string" ? data.newEmail.trim().toLowerCase() : ""
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return apiError("В запросе нет валидного newEmail", 400)
    }

    // Уникальность email — обработаем явно, иначе пользователь увидит 500
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, newEmail))
      .limit(1)
    if (conflict && conflict.id !== reqRow.userId) {
      return apiError("Этот email уже занят другим пользователем", 409)
    }

    await db.transaction(async (tx) => {
      await tx.update(users).set({ email: newEmail }).where(eq(users.id, reqRow.userId))
      await tx.update(supportRequests).set({ status: "done" }).where(eq(supportRequests.id, id))
    })

    return apiSuccess({ ok: true, status: "done", newEmail })
  } catch (err) {
    console.error("[admin/email-change-requests PATCH]", err)
    return apiError("Internal server error", 500)
  }
}
