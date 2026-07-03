// Ретроактивный прогон гейта «2-й части» после изменения порогов в Портрете
// (Юрий 03.07: «понизил балл прохождения — переоцени всех»). Пробегает
// кандидатов вакансии, ЗАВЕРШИВШИХ вопросы демо-1 (anketa_answers есть), на
// ранних стадиях и без выданной 2-й части, и вызывает штатный
// maybeScheduleSecondDemoInvite — тот сам считает гейт по АКТУАЛЬНЫМ порогам
// спека, ставит override-блок и приглашение (дедуп внутри). Прошедшим по
// новому порогу дополнительно снимаем гейтовый «предварительный отказ».
//
// POST без body. Ответ: { checked, invited, rejectionsCancelled, reasons }.
import { NextRequest } from "next/server"
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { maybeScheduleSecondDemoInvite } from "@/lib/messaging/second-demo-invite"
import { cancelScheduledRejection } from "@/lib/rejection/execute"

// Стадии, где приглашение на 2-ю часть ещё уместно.
const ELIGIBLE_STAGES = ["new", "primary_contact", "demo_opened", "decision", "anketa_filled"]

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const user = await requireCompany()
  const { id: vacancyId } = await params

  const [vac] = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
    .limit(1)
  if (!vac) return apiError("Vacancy not found", 404)

  const rows = await db
    .select({ id: candidates.id, pendingRejectionReason: candidates.pendingRejectionReason })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      inArray(candidates.stage, ELIGIBLE_STAGES),
      isNotNull(candidates.anketaAnswers),
    ))

  const reasons: Record<string, number> = {}
  let invited = 0
  let rejectionsCancelled = 0
  for (const row of rows) {
    try {
      const res = await maybeScheduleSecondDemoInvite({ candidateId: row.id, vacancyId })
      const key = res.scheduled ? "scheduled" : (res.reason ?? "unknown")
      reasons[key] = (reasons[key] ?? 0) + 1
      if (res.scheduled) {
        invited++
        // По новому порогу прошёл — гейтовый отложенный отказ больше не нужен.
        if (row.pendingRejectionReason === "anketa_gate_failed") {
          await cancelScheduledRejection(row.id).catch(() => {})
          rejectionsCancelled++
        }
      }
    } catch (err) {
      reasons.error = (reasons.error ?? 0) + 1
      console.error("[reapply-anketa-gate]", row.id, err instanceof Error ? err.message : err)
    }
  }

  return apiSuccess({ checked: rows.length, invited, rejectionsCancelled, reasons })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[reapply-anketa-gate]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
