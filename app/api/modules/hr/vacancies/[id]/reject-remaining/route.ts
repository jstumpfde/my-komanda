// POST /api/modules/hr/vacancies/[id]/reject-remaining
//
// «Закрыть вакансию → отказать оставшимся»: массово ставит ОТЛОЖЕННЫЙ отказ
// (scheduleRejection) всем ещё активным кандидатам вакансии. НЕ дублирует
// пайплайн отказа — переиспользует ТОТ ЖЕ механизм, что и остальная система:
//   - lib/rejection/execute.ts → scheduleRejection() ставит pendingRejectionAt
//     (+ reason/setAt), ничего не шлёт сама;
//   - исполняет cron /api/cron/pending-rejections (текст/discard в hh через
//     trySyncRejectToHh) — та же задержка/рабочие часы/санитайзер текста,
//     что и у любого другого отказа (стоп-факторы, предквалификация и т.д.).
//
// Гварды:
//   - requireCompany + владение вакансией (company_id совпадает).
//   - НЕ трогаем hired / started_work / offer_sent (кандидат уже принят или
//     в оффере — «закрыть вакансию» не должно случайно отказать ему).
//   - НЕ трогаем уже rejected и уже запланированных на отказ (idempotent —
//     scheduleRejection сам это проверяет, но фильтруем заранее, чтобы отчёт
//     count был честным).
//   - Пропускаем удалённых (deletedAt IS NOT NULL, «Корзина»).
//   - Тексты отказа НЕ хардкодим — берутся из vacancy.aiProcessSettings.
//     rejectMessage / company-дефолтов при исполнении cron'ом (как обычно).
//
// НЕ переводит стадию сразу — только планирует (как и весь остальной отказ в
// системе, ТЗ владельца: «мгновенных авто-отказов в системе нет»).

import { NextRequest } from "next/server"
import { and, eq, isNull, notInArray, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scheduleRejection, rejectionDelayMinutes } from "@/lib/rejection/execute"
import { logAudit, ipFromRequest } from "@/lib/audit/log"

const MAX_CANDIDATES = 1000

// Стадии, которые массовый отказ НЕ трогает: кандидат уже отказан/запланирован
// на отказ, либо уже принят/в оффере (задача явно требует не трогать hired/offer).
const EXCLUDED_STAGES = new Set<string>(["rejected", "hired", "started_work", "offer_sent"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    const [vacancy] = await db
      .select({
        id: vacancies.id,
        companyId: vacancies.companyId,
        aiProcessSettings: vacancies.aiProcessSettings,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Vacancy not found", 404)

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
    const reason = typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim()
      : "vacancy_closed_reject_remaining"

    // Кандидаты вакансии, ещё не отказанные/не запланированные/не в терминале,
    // не удалённые.
    const candidatesToReject = await db
      .select({ id: candidates.id, stage: candidates.stage })
      .from(candidates)
      .where(and(
        eq(candidates.vacancyId, vacancyId),
        isNull(candidates.deletedAt),
        isNull(candidates.pendingRejectionAt), // уже запланирован — не дублируем
        // NOT IN с NULL в колонке даёт NULL (строка бы отфильтровалась) — column
        // stage имеет default 'new', но на всякий случай (legacy-строки) явно
        // пускаем NULL через OR, иначе такие кандидаты молча пропадут из выборки.
        or(isNull(candidates.stage), notInArray(candidates.stage, [...EXCLUDED_STAGES])),
      ))
      .limit(MAX_CANDIDATES)

    if (candidatesToReject.length === 0) {
      return apiSuccess({ success: true, scheduled: 0, skipped: 0 })
    }

    const delayMinutes = rejectionDelayMinutes(
      (vacancy.aiProcessSettings as VacancyAiProcessSettings | null) ?? {},
    )

    let scheduled = 0
    const scheduledIds: string[] = []
    for (const cand of candidatesToReject) {
      const res = await scheduleRejection({
        candidateId: cand.id,
        reason,
        delayMinutes,
        // message не передаём — при исполнении cron возьмёт стандартный
        // rejectMessage вакансии/компании (ничего не хардкодим).
      })
      if (res.scheduled) {
        scheduled++
        scheduledIds.push(cand.id)
      }
    }

    await logAudit({
      tenantId:   user.companyId,
      userId:     user.id,
      userEmail:  user.email,
      action:     "vacancy_reject_remaining",
      entityType: "vacancy",
      entityId:   vacancyId,
      count:      scheduled,
      meta:       { reason, candidateIds: scheduledIds.slice(0, 500), delayMinutes },
      ip:         ipFromRequest(req),
    })

    return apiSuccess({
      success: true,
      scheduled,
      skipped: candidatesToReject.length - scheduled,
      delayMinutes,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
