import { NextRequest } from "next/server"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancyIntakes } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — list intakes for tenant
export async function GET() {
  try {
    const user = await requireCompany()
    const intakes = await db
      .select()
      .from(vacancyIntakes)
      .where(eq(vacancyIntakes.tenantId, user.companyId))
      .orderBy(desc(vacancyIntakes.createdAt))
      .limit(100)
    return apiSuccess(intakes)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// PATCH — update intake status
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { id: string; status: string; vacancyId?: string }

    const [updated] = await db
      .update(vacancyIntakes)
      .set({
        status: body.status,
        ...(body.vacancyId ? { vacancyId: body.vacancyId } : {}),
      })
      .where(eq(vacancyIntakes.id, body.id))
      .returning()

    if (!updated) return apiError("Заявка не найдена", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
