import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { rooms } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and } from "drizzle-orm"

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    const list = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.companyId, user.companyId), eq(rooms.isActive, true)))
      .orderBy(rooms.name)

    return apiSuccess(list)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    const { name, capacity, equipment, floor } = body
    if (!name) return apiError("Название переговорной обязательно")

    const [room] = await db
      .insert(rooms)
      .values({
        companyId: user.companyId,
        name,
        capacity: capacity ?? null,
        equipment: equipment ?? [],
        floor: floor ?? null,
        isActive: true,
      })
      .returning()

    return apiSuccess(room, 201)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
