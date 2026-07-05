// POST /api/modules/hr/candidates/[id]/interview-decision
//
// Скоркарта интервью — кнопка «Отказ» (Company24, дизайн координатора,
// одобрен Юрием 05.07). Единственная причина существования этого роута:
// решение "reject" НЕ должно быть мгновенным (ТЗ владельца: «мгновенных
// авто-отказов в системе нет») — используем ТОТ ЖЕ канон, что и остальная
// система (lib/rejection/execute.ts → scheduleRejection), а не
// PUT .../stage {stage:"rejected"} (тот путь мгновенный, для ручных решений
// HR в других местах интерфейса — оставлен как есть, не трогаем).
//
// «Дальше по воронке» / «Оффер» / «В резерв» НЕ нуждаются в отдельном роуте —
// drawer вызывает существующий PUT /api/modules/hr/candidates/[id]/stage
// напрямую (см. handleStageChange).

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scheduleRejection, rejectionDelayMinutes } from "@/lib/rejection/execute"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json() as {
      decision?: unknown
      rejectionReasonCategory?: string | null
      rejectionComment?: string | null
    }
    if (body.decision !== "reject") {
      return apiError("Only decision='reject' is handled by this route", 400)
    }

    const [row] = await db
      .select({
        candidateId:       candidates.id,
        stage:             candidates.stage,
        vacancyId:         candidates.vacancyId,
        aiProcessSettings: vacancies.aiProcessSettings,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Candidate not found", 404)

    const delayMinutes = rejectionDelayMinutes(row.aiProcessSettings as VacancyAiProcessSettings | null)
    const result = await scheduleRejection({
      candidateId: id,
      reason: "interview_scorecard_decision",
      delayMinutes,
    })

    // Дополнительно захватываем причину/комментарий отказа сразу (та же
    // таксономия, что и в диалоге «Отказ» — отчёт найма читает эти поля
    // независимо от того, исполнился ли уже отложенный отказ).
    if (typeof body.rejectionReasonCategory === "string" || typeof body.rejectionComment === "string") {
      await db.update(candidates).set({
        rejectionReasonCategory: body.rejectionReasonCategory ?? null,
        rejectionInitiator:      "company",
        rejectionComment:        body.rejectionComment?.trim() || null,
      }).where(eq(candidates.id, id))
    }

    return apiSuccess({ scheduled: result.scheduled, pendingRejectionAt: result.at })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
