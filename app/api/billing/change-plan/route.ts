import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies, plans, subscriptionHistory } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { apiError, requireCompany } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const body = await req.json().catch(() => ({}))
  const { planId } = body as { planId?: string }

  if (!planId) return apiError("planId обязателен", 400)

  const planRows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  const plan = planRows[0]
  if (!plan) return apiError("Тариф не найден", 404)
  if (plan.isArchived) return apiError("Этот тариф устарел и недоступен", 400)

  const now = new Date()

  // Update company
  await db
    .update(companies)
    .set({
      currentPlanId:      planId,
      planId:             planId,
      subscriptionStatus: "active",
      updatedAt:          now,
    })
    .where(eq(companies.id, user.companyId))

  // Create subscription history entry
  await db.insert(subscriptionHistory).values({
    companyId: user.companyId,
    planId,
    event:     "plan_changed",
    details:   { status: "active", changedAt: now.toISOString() },
  })

  return NextResponse.json({ success: true, planName: plan.name })
}
