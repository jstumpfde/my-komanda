import { NextResponse } from "next/server"
import { eq, and, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { auth } from "@/auth"

// GET /api/modules/hr/awaiting-review
//
// Возвращает {count} — число кандидатов в стадии anketa_filled
// по всей компании пользователя. Используется баннером на /hr/dashboard
// чтобы HR видел общую очередь готовых к разбору (P0-8).
//
// 192 заполнили анкету / 17 переведены в decision → 175 «болото» —
// невидимое для HR. Эта цифра делает его видимым.

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const companyId = session.user.companyId

  // INNER JOIN candidates × vacancies гарантирует, что считаем только
  // кандидатов из вакансий своей компании.
  const [row] = await db
    .select({ c: count() })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(and(
      eq(vacancies.companyId, companyId),
      eq(candidates.stage, "anketa_filled"),
    ))

  return NextResponse.json({ count: row?.c ?? 0 })
}
