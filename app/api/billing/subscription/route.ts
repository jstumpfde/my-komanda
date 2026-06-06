import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies, plans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)

  const company = companyRows[0]
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  // Get current plan
  const planId = company.currentPlanId ?? company.planId
  let plan = null
  if (planId) {
    const planRows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    plan = planRows[0] ?? null
  }

  // Дней до конца: для триала — trialEndsAt, для активного тарифа — currentPeriodEnd.
  const daysTo = (d: Date | string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  let daysRemaining: number | null = null
  if (company.subscriptionStatus === "trial" && company.trialEndsAt) {
    daysRemaining = daysTo(company.trialEndsAt)
  } else if (company.subscriptionStatus === "active" && company.currentPeriodEnd) {
    daysRemaining = daysTo(company.currentPeriodEnd)
  }

  return NextResponse.json({
    status:           company.subscriptionStatus ?? "trial",
    trialEndsAt:      company.trialEndsAt,
    currentPeriodEnd: company.currentPeriodEnd,
    companyCreatedAt: company.createdAt,
    daysRemaining,
    plan: plan ? {
      id:    plan.id,
      name:  plan.name,
      price: plan.price,
      slug:  plan.slug,
    } : null,
  })
}
