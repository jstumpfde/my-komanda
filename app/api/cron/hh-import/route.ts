import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhVacancies, vacancies, hhTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { HHClient, HHMockClient } from "@/lib/hh/client"

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    // Find all active hh_vacancies
    const activeRows = await db
      .select({
        hhVacancyId: hhVacancies.hhVacancyId,
        vacancyId: hhVacancies.vacancyId,
        companyId: vacancies.companyId,
      })
      .from(hhVacancies)
      .innerJoin(vacancies, eq(hhVacancies.vacancyId, vacancies.id))
      .where(eq(hhVacancies.hhStatus, "active"))

    let processed = 0
    let totalImported = 0

    for (const row of activeRows) {
      try {
        // Check if token exists for this company
        const tokenRows = await db
          .select()
          .from(hhTokens)
          .where(eq(hhTokens.companyId, row.companyId))
          .limit(1)

        let result: { imported: number }

        if (!tokenRows[0] || process.env.NODE_ENV === "development") {
          // Skip mock in cron to avoid flooding with test data
          processed++
          continue
        }

        const client = new HHClient(row.companyId)
        result = await client.importApplications(row.vacancyId)

        totalImported += result.imported
        processed++
      } catch (err) {
        console.error(`[HH cron] Failed to import for vacancy ${row.vacancyId}:`, err)
      }
    }

    return NextResponse.json({ processed, imported: totalImported })
  } catch (err) {
    console.error("[HH cron]", err)
    return NextResponse.json({ error: "Ошибка CRON" }, { status: 500 })
  }
}
