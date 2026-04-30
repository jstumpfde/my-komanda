import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { and, eq, lt } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"

// POST /api/cron/check-subscriptions — отмечаем компании с истекшим триалом.
// Protected by X-Cron-Secret header.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = new Date()

  // Find trial companies where trial has expired
  const expired = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.subscriptionStatus, "trial"),
        lt(companies.trialEndsAt, now)
      )
    )

  if (expired.length > 0) {
    for (const c of expired) {
      await db
        .update(companies)
        .set({ subscriptionStatus: "expired", updatedAt: now })
        .where(eq(companies.id, c.id))
    }
  }

  return NextResponse.json({
    processed: expired.length,
    at:        now.toISOString(),
  })
}
