import { NextRequest } from "next/server"
import { and, eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { radarTopics } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireRadarAccess } from "@/lib/radar/access"

// GET — дерево тем/подтем компании.
export async function GET() {
  try {
    const user = await requireRadarAccess()
    const topics = await db.select()
      .from(radarTopics).where(eq(radarTopics.companyId, user.companyId))
      .orderBy(asc(radarTopics.sortOrder), asc(radarTopics.name))
    return apiSuccess({ topics })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}

// POST { name, parentId?, color? } — создать тему или подтему.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRadarAccess()
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = (b.name as string || "").trim()
    if (!name) return apiError("Нужно название темы", 400)
    const [row] = await db.insert(radarTopics).values({
      companyId: user.companyId,
      parentId: (b.parentId as string) || null,
      name,
      color: (b.color as string) || null,
    }).returning()
    return apiSuccess(row)
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}

// DELETE ?id= — удалить тему (контент темы открепится: topic_id → null).
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireRadarAccess()
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return apiError("Нет id", 400)
    await db.delete(radarTopics).where(and(eq(radarTopics.id, id), eq(radarTopics.companyId, user.companyId)))
    return apiSuccess({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}
