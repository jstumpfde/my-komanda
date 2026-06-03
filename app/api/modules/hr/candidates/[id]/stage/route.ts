import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { trySyncStageToHh } from "@/lib/hh/sync-stage"
import { sendWebhook } from "@/lib/webhooks"

const VALID_STAGES = [
  "new", "primary_contact", "demo", "demo_opened", "decision",
  "anketa_filled", "ai_screening", "interview", "final_decision",
  "hired", "rejected", "talent_pool", "pending", "preboarding",
  // Этап 2: исходы тестового задания (lib/stages.ts test_passed/test_failed).
  "test_task_done", "test_passed", "test_failed",
] as const
type Stage = (typeof VALID_STAGES)[number]

// Стейджи «после приглашения». Если кандидат уже был в одном из них
// и его переводят в primary_contact — это внутренняя ручная корректировка,
// hh-инвайт повторно не отправляем (он уже его получил).
const POST_INVITE_STAGES: ReadonlySet<Stage> = new Set([
  "primary_contact", "demo_opened", "demo", "anketa_filled",
  "decision", "ai_screening", "interview", "final_decision", "hired",
])

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json() as { stage?: unknown }
    const stage = body.stage as Stage | undefined

    if (!stage || !(VALID_STAGES as readonly string[]).includes(stage)) {
      return apiError(
        `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`,
        400
      )
    }

    // Verify candidate belongs to user's company via vacancy join.
    // Возвращаем previousStage чтобы понять, нужен ли hh-инвайт.
    const [row] = await db
      .select({ candidateId: candidates.id, previousStage: candidates.stage })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) {
      return apiError("Candidate not found", 404)
    }

    const stopAutoProcessing = stage === "rejected"

    const [updated] = await db
      .update(candidates)
      .set({
        stage,
        updatedAt: new Date(),
        ...(stopAutoProcessing
          ? {
              autoProcessingStopped: true,
              autoProcessingStoppedReason: "manual_rejection",
              autoProcessingStoppedAt: new Date(),
            }
          : {}),
      })
      .where(eq(candidates.id, id))
      .returning()

    // Sync с hh.ru — fire-and-forget, ошибка не блокирует ответ.
    // Ф6: hh-action читается из pipeline вакансии (lib/hh/sync-stage.ts).
    // Дефолтное поведение совпадает со старым (primary_contact = invitation,
    // rejected = discard), но теперь HR может настроить hh-action на любой
    // стадии в табе «Воронка».
    //
    // Защита от повторного invite: если HR двигает кандидата в стадию с
    // hhAction=invitation, а кандидат уже был дальше по воронке —
    // пропускаем sync. Иначе HR-исправление back-to-primary_contact
    // привело бы к повторному hh-приглашению.
    const alreadyInvited = stage === "primary_contact"
      && row.previousStage !== null
      && POST_INVITE_STAGES.has(row.previousStage as Stage)
    if (!alreadyInvited) {
      trySyncStageToHh(id, stage).catch((err) => {
        console.warn(`[stage-route] hh sync failed for ${id} (${stage}):`, err)
      })
    }

    // Webhooks (hiring_defaults.webhooks): отправляем событие смены этапа во
    // внешнюю систему компании, если HR задал URL и включил событие.
    // Fire-and-forget — таймаут/ошибка не влияют на ответ. Раньше настройки
    // webhooks ни к чему не были подключены (lib/webhooks.ts не вызывался).
    void (async () => {
      try {
        const [company] = await db
          .select({ hd: companies.hiringDefaultsJson })
          .from(companies)
          .where(eq(companies.id, user.companyId))
          .limit(1)
        const wh = (company?.hd as { webhooks?: { url?: string; events?: Record<string, boolean> } } | null)?.webhooks
        if (wh?.url) {
          const events = wh.events || {}
          const payload = { candidateId: id, stage, previousStage: row.previousStage, vacancyId: updated.vacancyId }
          if (events.stage_change) await sendWebhook(wh.url, "stage_change", payload)
          if (stage === "rejected" && events.reject) await sendWebhook(wh.url, "reject", payload)
        }
      } catch (err) {
        console.warn("[stage-route] webhook dispatch failed:", err)
      }
    })()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
