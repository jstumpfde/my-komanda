import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { plans } from "@/lib/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ planId: string }> }

// POST /api/admin/plans/[planId]/archive — переместить тариф в архив.
// Только активные (не в корзине, не в архиве).
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  const [archived] = await db
    .update(plans)
    .set({ archivedAt: new Date(), isArchived: true })
    .where(and(eq(plans.id, planId), isNull(plans.deletedAt), isNull(plans.archivedAt)))
    .returning({ id: plans.id })

  if (!archived) return apiError("Тариф не найден или уже в архиве/корзине", 404)

  return apiSuccess({ archived: true })
}

// DELETE /api/admin/plans/[planId]/archive — восстановить тариф из архива.
// Только если тариф в архиве (archived_at IS NOT NULL).
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { planId } = await params

  const [restored] = await db
    .update(plans)
    .set({ archivedAt: null, isArchived: false })
    .where(and(eq(plans.id, planId), isNull(plans.deletedAt)))
    .returning({ id: plans.id })

  if (!restored) return apiError("Тариф не найден в архиве", 404)

  return apiSuccess({ restored: true })
}
