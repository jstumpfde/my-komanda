import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// PUT /api/admin/clients/[id]/assign-manager
// Назначить/снять менеджеров для компании-клиента (или партнёра — партнёр
// тоже является компанией с integrator).
// Body: { salesManagerId?: string | null, accountManagerId?: string | null }
//   Пустая строка или null → NULL (снять назначение).
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  let body: { salesManagerId?: unknown; accountManagerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return apiError("Некорректный JSON", 400)
  }

  const updateData: Record<string, string | null | Date> = {
    updatedAt: new Date(),
  }

  // salesManagerId: string (uuid) → назначить; "" или null → снять (NULL).
  if ("salesManagerId" in body) {
    const v = body.salesManagerId
    if (v === null || v === "" || v === undefined) {
      updateData.salesManagerId = null
    } else if (typeof v === "string") {
      updateData.salesManagerId = v
    } else {
      return apiError("salesManagerId должен быть строкой или null", 400)
    }
  }

  // accountManagerId: аналогично.
  if ("accountManagerId" in body) {
    const v = body.accountManagerId
    if (v === null || v === "" || v === undefined) {
      updateData.accountManagerId = null
    } else if (typeof v === "string") {
      updateData.accountManagerId = v
    } else {
      return apiError("accountManagerId должен быть строкой или null", 400)
    }
  }

  if (Object.keys(updateData).length === 1) {
    // Только updatedAt — нечего менять.
    return apiError("Не передано ни одного поля для обновления", 400)
  }

  try {
    const [updated] = await db
      .update(companies)
      .set(updateData)
      .where(eq(companies.id, id))
      .returning({
        id:               companies.id,
        salesManagerId:   companies.salesManagerId,
        accountManagerId: companies.accountManagerId,
      })

    if (!updated) return apiError("Компания не найдена", 404)

    return apiSuccess({
      id:               updated.id,
      salesManagerId:   updated.salesManagerId,
      accountManagerId: updated.accountManagerId,
    })
  } catch (err) {
    console.error("[admin/clients/assign-manager PUT]", err)
    return apiError("Internal server error", 500)
  }
}
