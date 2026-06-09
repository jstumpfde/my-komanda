import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { integrators, integratorClients, integratorLevels } from "@/lib/db/schema"
import { eq, count, asc } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "recalculate-integrator-levels"

// POST /api/cron/recalculate-integrator-levels — Protected by X-Cron-Secret header.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)

  try {
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

    if (run) await finishCronRun(run.id, "ok", { updated, total: allIntegrators.length })
    return NextResponse.json({ ok: true, updated, total: allIntegrators.length })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    console.error("[cron/recalculate-integrator-levels]", err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
