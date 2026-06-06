// O5: список вакансий компании с включённым AI-чат-ботом — для точечного
// аварийного отключения из блока «Аварийное отключение AI» (Настройки найма).
import { NextResponse } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select({
        id:               vacancies.id,
        title:            vacancies.title,
        status:           vacancies.status,
        aiChatbotEnabled: vacancies.aiChatbotEnabled,
      })
      .from(vacancies)
      .where(and(
        eq(vacancies.companyId, user.companyId),
        eq(vacancies.aiChatbotEnabled, true),
        isNull(vacancies.deletedAt),
      ))
      .orderBy(vacancies.title)
    return NextResponse.json({ vacancies: rows })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
