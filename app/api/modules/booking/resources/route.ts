import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookingResources } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const rows = await db
      .select()
      .from(bookingResources)
      .where(eq(bookingResources.tenantId, user.companyId))
      .orderBy(bookingResources.createdAt)
    return apiSuccess({ resources: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.name?.trim()) return apiError("'name' is required", 400)

    const [resource] = await db
      .insert(bookingResources)
      .values({
        tenantId: user.companyId,
        name: body.name.trim(),
        type: body.type || "specialist",
        description: body.description || null,
        avatar: body.avatar || null,
        isActive: body.isActive ?? true,
        schedule: body.schedule || null,
        breaks: body.breaks || null,
      })
      .returning()
    return apiSuccess(resource, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
