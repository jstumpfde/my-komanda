import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { vacancies, hhTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { HHClient, HHMockClient } from "@/lib/hh/client"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireCompany()
    const vacancyId = params.id

    // Verify ownership
    const vacancyRows = await db
      .select()
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    const vacancy = vacancyRows[0]
    if (!vacancy || vacancy.companyId !== user.companyId) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    // Check if token exists
    const tokenRows = await db
      .select()
      .from(hhTokens)
      .where(eq(hhTokens.companyId, user.companyId))
      .limit(1)

    let result: { imported: number }

    if (!tokenRows[0] || process.env.NODE_ENV === "development") {
      const mock = new HHMockClient(user.companyId)
      result = await mock.importApplications(vacancyId)
    } else {
      const client = new HHClient(user.companyId)
      result = await client.importApplications(vacancyId)
    }

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH import]", err)
    return NextResponse.json({ error: "Ошибка импорта" }, { status: 500 })
  }
}
