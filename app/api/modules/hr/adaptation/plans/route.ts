import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/adaptation/plans
export async function GET() {
  try {
    const user = await requireCompany()
    const plans = await db
      .select()
      .from(adaptationPlans)
      .where(eq(adaptationPlans.tenantId, user.companyId))
    return apiSuccess(plans)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/adaptation/plans
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      title: string
      description?: string
      positionId?: string
      durationDays?: number
      planType?: string
      isTemplate?: boolean
    }

    if (!body.title) return apiError("title обязателен", 400)

    const [plan] = await db.insert(adaptationPlans).values({
      tenantId:    user.companyId,
      title:       body.title,
      description: body.description ?? null,
      positionId:  body.positionId ?? null,
      durationDays:body.durationDays ?? 14,
      planType:    body.planType ?? "onboarding",
      isTemplate:  body.isTemplate ?? false,
      createdBy:   user.id,
    }).returning()

    return apiSuccess(plan, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
