// POST /api/modules/hr/vacancies/[id]/hh-broadcast-mark-sent
// body: { candidateIds: string[] }
//
// Полу-ручная рассылка через hh-чат (hh-broadcast-dialog) отправляет приглашение
// к тесту вручную (HR вставляет текст в чат hh). Платформа не знает факт отправки,
// поэтому фронт после «Отправлено → следующий» зовёт этот эндпоинт, чтобы стадия
// кандидата стала test_task_sent → в колонке «Тест» появляется «отп.» (отправлен).
//
// Зеркалит логику scheduleTestInvitesForCandidates: двигаем стадию только вперёд
// (NO_DOWNGRADE), синкаем стадию в воронку hh.

import { NextRequest } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { trySyncTestStageToHh } from "@/lib/hh/sync-stage"

// Стадии, которые НЕ откатываем назад к test_task_sent (кандидат уже дальше).
const NO_DOWNGRADE = new Set<string>([
  "test_task_sent", "test_task_done", "test_passed", "test_failed",
  "scheduled", "interview", "interviewed", "reference_check",
  "decision", "final_decision", "offer_sent", "offer", "hired", "rejected",
])

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

    // Берём только кандидатов этой вакансии (доп. tenant-изоляция) + их текущую стадию
    const rows = await db
      .select({ id: candidates.id, stage: candidates.stage })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, id), inArray(candidates.id, candidateIds)))

    const toAdvance = rows
      .filter((r) => !NO_DOWNGRADE.has(r.stage ?? "new"))
      .map((r) => r.id)

    if (toAdvance.length > 0) {
      await db.update(candidates)
        .set({ stage: "test_task_sent", updatedAt: new Date() })
        .where(inArray(candidates.id, toAdvance))
      // Зеркалим стадию в воронку hh (fire-and-forget — не блокируем ответ).
      for (const cid of toAdvance) void trySyncTestStageToHh(cid).catch(() => {})
    }

    return apiSuccess({ marked: toAdvance.length, skipped: rows.length - toAdvance.length })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-broadcast-mark-sent]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
