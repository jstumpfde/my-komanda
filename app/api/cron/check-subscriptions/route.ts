import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { and, eq, lt } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

// POST /api/cron/check-subscriptions — отмечаем компании с истекшим триалом.
// Protected by X-Cron-Secret header.
const CRON_NAME = "check-subscriptions"

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  const now = new Date()

  try {
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

    if (run) await finishCronRun(run.id, "ok", { processed: expired.length })
    return NextResponse.json({
      processed: expired.length,
      at:        now.toISOString(),
    })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    throw err
  }
}
