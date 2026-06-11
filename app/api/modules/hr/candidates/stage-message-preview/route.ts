// Предпросмотр сообщения, которое уйдёт кандидату при смене стадии.
//
// GET /api/modules/hr/candidates/stage-message-preview?stage=...&vacancyId=...
//
// Возвращает:
//   { hasMessage: true,  channel: "hh"|"follow_up", text: "..." }
//   { hasMessage: false, reason: "no_action_for_stage"|"assessment_no_text" }
//
// Канал зависит от стадии:
//   - Стадии с hhAction=invitation → hh-чат (приглашение/демо-ссылка)
//   - Стадии с hhAction=discard   → hh-чат (отказ)
//   - "interview"                 → follow_up (schedule_invite)
//   - Остальные                   → нет сообщения
//
// Текст содержит {{переменные}} как есть — HR видит шаблон, переменные
// раскрываются в реальных именах при отправке через cron/API.

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getStageHhAction, parsePipeline } from "@/lib/stages"
import { DEFAULT_REJECT_MESSAGE, DEFAULT_INVITE_MESSAGE } from "@/lib/hh/default-messages"
import { DEFAULT_SCHEDULE_INVITE_TEXT } from "@/lib/messaging/schedule-invite"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { searchParams } = req.nextUrl
    const stage     = searchParams.get("stage")
    const vacancyId = searchParams.get("vacancyId")

    if (!stage || !vacancyId) {
      return apiError("stage и vacancyId обязательны", 400)
    }

    // Загружаем вакансию, проверяем принадлежность компании.
    const [vac] = await db
      .select({
        id:                vacancies.id,
        title:             vacancies.title,
        companyId:         vacancies.companyId,
        aiProcessSettings: vacancies.aiProcessSettings,
        descriptionJson:   vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Вакансия не найдена", 404)

    // Company-level hh-маппинг (как в trySyncStageToHh).
    const [companyRow] = await db
      .select({ hiringDefaults: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    const companyHhActions = (
      companyRow?.hiringDefaults as {
        stageHhActions?: Record<string, "invitation" | "discard" | "assessment" | null>
      } | null
    )?.stageHhActions

    const pipeline = parsePipeline(
      (vac.descriptionJson as Record<string, unknown> | null)?.pipeline,
      companyHhActions,
    )
    const hhAction = getStageHhAction(stage, pipeline)
    const settings = (vac.aiProcessSettings as VacancyAiProcessSettings | null) ?? {}

    // ── interview → follow_up schedule_invite ──────────────────────────────
    if (stage === "interview") {
      return apiSuccess({
        hasMessage: true,
        channel:    "follow_up",
        branch:     "schedule_invite",
        text:       DEFAULT_SCHEDULE_INVITE_TEXT,
        note:       "Отправляется через hh-чат с задержкой 1 мин (cron follow-up). Переменные: {{name}}, {{vacancy}}, {{schedule_link}}.",
      })
    }

    // ── hh action: отказ ───────────────────────────────────────────────────
    if (hhAction === "discard") {
      const tpl = settings.rejectMessage?.trim() || DEFAULT_REJECT_MESSAGE
      return apiSuccess({
        hasMessage: true,
        channel:    "hh",
        hhAction:   "discard",
        text:       tpl,
        note:       "Отправляется в hh-чат сразу при смене стадии. Переменные: {{name}}, {{vacancy}}.",
      })
    }

    // ── hh action: приглашение ─────────────────────────────────────────────
    if (hhAction === "invitation") {
      const tpl = settings.inviteMessage?.trim() || DEFAULT_INVITE_MESSAGE
      return apiSuccess({
        hasMessage: true,
        channel:    "hh",
        hhAction:   "invitation",
        text:       tpl,
        note:       "Отправляется в hh-чат сразу при смене стадии. Переменные: {{name}}, {{vacancy}}, {{demo_link}}.",
      })
    }

    // ── hh action: тестовое задание (без текста сообщения) ────────────────
    if (hhAction === "assessment") {
      return apiSuccess({
        hasMessage: false,
        reason:     "assessment_no_text",
        note:       "Меняет статус отклика на hh на «Тестовое задание» — без текста сообщения в чат.",
      })
    }

    // ── Нет сообщения для данной стадии ───────────────────────────────────
    return apiSuccess({
      hasMessage: false,
      reason:     "no_action_for_stage",
      note:       "Для этой стадии сообщение кандидату не предусмотрено.",
    })

  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
