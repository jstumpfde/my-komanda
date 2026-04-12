import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookingServices } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const rows = await db
      .select()
      .from(bookingServices)
      .where(eq(bookingServices.tenantId, user.companyId))
      .orderBy(bookingServices.sortOrder)
    return apiSuccess({ services: rows })
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

    const [service] = await db
      .insert(bookingServices)
      .values({
        tenantId: user.companyId,
        name: body.name.trim(),
        description: body.description || null,
        duration: body.duration || 60,
        price: body.price ?? null,
        currency: body.currency || "RUB",
        color: body.color || "#3B82F6",
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder || 0,
      })
      .returning()
    return apiSuccess(service, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
