import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { apiError, requirePlatformAdmin } from "@/lib/api-helpers"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as NextResponse
  }

  const { id: companyId } = await params
  const body = await req.json().catch(() => ({}))
  const {
    subscriptionStatus,
    trialEndsAt,
    currentPlanId,
  } = body as {
    subscriptionStatus?: string
    trialEndsAt?: string | null
    currentPlanId?: string | null
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus
  if (trialEndsAt !== undefined) {
    updateData.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null
  }
  if (currentPlanId !== undefined) {
    updateData.currentPlanId = currentPlanId
    if (currentPlanId) updateData.planId = currentPlanId
  }

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, companyId))
    .returning()

  if (!updated) return apiError("Компания не найдена", 404)

  return NextResponse.json({
    id:                 updated.id,
    subscriptionStatus: updated.subscriptionStatus,
    trialEndsAt:        updated.trialEndsAt,
    currentPlanId:      updated.currentPlanId,
  })
}
