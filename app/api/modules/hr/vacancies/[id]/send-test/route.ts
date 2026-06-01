// POST /api/modules/hr/vacancies/[id]/send-test
// Ставит в очередь приглашение пройти тест выбранным кандидатам вакансии.
// Body: { candidateIds: string[] }
//
// Рассылка НЕ мгновенная: scheduleTestInvitesForCandidates кладёт записи в
// follow_up_messages (branch='test_invite'), а cron /api/cron/follow-up шлёт их
// по очереди с паузой между отправками (настройка задержки компании). Стадия
// выбранных кандидатов переводится в test_task_sent (если не дальше по воронке),
// что и останавливает дожим. См. lib/messaging/test-invite.ts.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scheduleTestInvitesForCandidates } from "@/lib/messaging/test-invite"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Вакансия принадлежит компании?
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const body = await req.json().catch(() => ({}))
    const candidateIds = Array.isArray(body?.candidateIds)
      ? body.candidateIds.filter((x: unknown): x is string => typeof x === "string")
      : []
    if (!candidateIds.length) return apiError("Не выбраны кандидаты", 400)

    const res = await scheduleTestInvitesForCandidates({ vacancyId: id, candidateIds })

    if (!res.ok) {
      if (res.error === "no_test") {
        return apiError("Сначала настройте тест на вакансии (вкладка «Тест»)", 400)
      }
      if (res.error === "no_candidates") {
        return apiError("Кандидаты не найдены в этой вакансии", 400)
      }
      return apiError("Не удалось поставить тест в очередь", 500)
    }

    return apiSuccess({
      scheduled:     res.scheduled,
      alreadyQueued: res.alreadyQueued,
      skipped:       res.skipped,
      scheduledAt:   res.scheduledAt,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[send-test]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
