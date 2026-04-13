import { NextRequest } from "next/server"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { supportRequests } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST — create support request
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { type: string; data: Record<string, unknown> }

    if (!body.type || !body.data) return apiError("type и data обязательны", 400)

    const [request] = await db
      .insert(supportRequests)
      .values({
        tenantId: user.companyId,
        userId: user.id!,
        type: body.type,
        data: body.data,
        status: "new",
      })
      .returning()

    return apiSuccess(request, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// GET — list support requests (for admin)
export async function GET() {
  try {
    const user = await requireCompany()
    const requests = await db
      .select()
      .from(supportRequests)
      .where(eq(supportRequests.tenantId, user.companyId))
      .orderBy(desc(supportRequests.createdAt))
      .limit(50)
    return apiSuccess(requests)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
