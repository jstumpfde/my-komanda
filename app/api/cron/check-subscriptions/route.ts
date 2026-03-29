import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { and, eq, lt } from "drizzle-orm"

export async function GET() {
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
