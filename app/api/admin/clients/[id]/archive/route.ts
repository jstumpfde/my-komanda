import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/clients/[id]/archive — переместить компанию в архив.
// Только активные (не в корзине, не в архиве).
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [archived] = await db
    .update(companies)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(companies.id, id), isNull(companies.deletedAt), isNull(companies.archivedAt)))
    .returning({ id: companies.id })

  if (!archived) return apiError("Компания не найдена или уже в архиве/корзине", 404)

  return apiSuccess({ archived: true })
}

// DELETE /api/admin/clients/[id]/archive — восстановить компанию из архива.
// Только если компания в архиве (archived_at IS NOT NULL).
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [restored] = await db
    .update(companies)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .returning({ id: companies.id })

  if (!restored) return apiError("Компания не найдена в архиве", 404)

  return apiSuccess({ restored: true })
}
