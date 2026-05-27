import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { HHMockClient } from "@/lib/hh/client"
import { getValidToken } from "@/lib/hh-helpers"
import { importHhResponsesForVacancy } from "@/lib/hh/import-responses"

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

    // Токен hh через getValidToken (читает hh_integrations + авто-рефреш) —
    // тот же путь, что у кнопки «Синхронизировать» и основного cron'а.
    // В dev или без активной интеграции — mock (как было раньше).
    const tokenResult =
      process.env.NODE_ENV === "development" ? null : await getValidToken(user.companyId)

    let result: { imported: number }

    if (!tokenResult) {
      const mock = new HHMockClient(user.companyId)
      result = await mock.importApplications(vacancyId)
    } else {
      // hh API ждёт числовой vacancy_id; UUID нашей vacancies.id не годится.
      const hhVacancyId = vacancy.hhVacancyId
      if (!hhVacancyId || !/^\d+$/.test(hhVacancyId)) {
        return NextResponse.json(
          { error: "У вакансии нет корректного hh_vacancy_id" },
          { status: 400 },
        )
      }
      // ПЕРЕВЕДЕНО с HHClient.importApplications (писал НАПРЯМУЮ в candidates,
      // минуя hh_responses → застревание в stage='new') на общий
      // importHhResponsesForVacancy. mode "sync" — ручной импорт затягивает ВСЕ
      // отклики (HR хочет всё, что есть на hh), как кнопка «Синхронизировать».
      const r = await importHhResponsesForVacancy({
        companyId: user.companyId,
        accessToken: tokenResult.accessToken,
        hhVacancyId,
        mode: "sync",
      })
      result = { imported: r.imported }
    }

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[HH import]", err)
    return NextResponse.json({ error: "Ошибка импорта" }, { status: 500 })
  }
}
