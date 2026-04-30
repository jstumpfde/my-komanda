import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { integrators, integratorClients, integratorLevels } from "@/lib/db/schema"
import { eq, count, asc } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"

// POST /api/cron/recalculate-integrator-levels — Protected by X-Cron-Secret header.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const allIntegrators = await db.select().from(integrators)
  const levels = await db.select().from(integratorLevels)
    .where(eq(integratorLevels.isActive, true))
    .orderBy(asc(integratorLevels.sortOrder))

  let updated = 0

  for (const integrator of allIntegrators) {
    const [clientCountRow] = await db
      .select({ cnt: count() })
      .from(integratorClients)
      .where(eq(integratorClients.integratorId, integrator.id))

    const clientCount = clientCountRow?.cnt ?? 0

    // Find best matching level
    let bestLevel = levels[0]
    for (const level of levels) {
      if (clientCount >= (level.minClients ?? 0)) {
        bestLevel = level
      }
    }

    if (bestLevel && integrator.levelId !== bestLevel.id) {
      await db
        .update(integrators)
        .set({ levelId: bestLevel.id })
        .where(eq(integrators.id, integrator.id))
      updated++
    }
  }

  return NextResponse.json({ ok: true, updated, total: allIntegrators.length })
}
