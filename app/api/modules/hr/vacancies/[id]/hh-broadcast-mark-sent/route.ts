// POST /api/modules/hr/vacancies/[id]/hh-broadcast-mark-sent
// body: { candidateIds: string[] }
//
// Полу-ручная рассылка через hh-чат (hh-broadcast-dialog) отправляет приглашение
// к тесту вручную (HR вставляет текст в чат hh). Платформа не знает факт отправки,
// поэтому фронт после копирования/«Отправлено» зовёт этот эндпоинт.
//
// ВАЖНО: НЕ двигаем стадию кандидата (иначе в колонке «Статус» появлялось бы
// «Тест отправлен» — Юрий это не хочет). Ставим только маркер test_invite_sent_at,
// который драйвит ТОЛЬКО колонку «Тест» (= «отп.»).

import { NextRequest } from "next/server"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // tenant-изоляция: вакансия принадлежит компании
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const body = (await req.json().catch(() => ({}))) as { candidateIds?: unknown }
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((x): x is string => typeof x === "string")
      : []
    if (candidateIds.length === 0) return apiError("Не выбраны кандидаты", 400)

    // Ставим маркер только тем, у кого его ещё нет (не перетираем дату повторно).
    // Стадию НЕ трогаем.
    const updated = await db.update(candidates)
      .set({ testInviteSentAt: new Date() })
      .where(and(
        eq(candidates.vacancyId, id),
        inArray(candidates.id, candidateIds),
        isNull(candidates.testInviteSentAt),
      ))
      .returning({ id: candidates.id })

    return apiSuccess({ marked: updated.length })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-broadcast-mark-sent]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
