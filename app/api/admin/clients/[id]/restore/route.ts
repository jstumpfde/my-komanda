import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq, and, isNotNull } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/clients/[id]/restore — вернуть компанию из корзины.
// Только если она действительно в корзине (deleted_at IS NOT NULL).
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const [restored] = await db
    .update(companies)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(companies.id, id), isNotNull(companies.deletedAt)))
    .returning({ id: companies.id })

  if (!restored) return apiError("Компания не найдена в корзине", 404)

  return apiSuccess({ restored: true })
}
