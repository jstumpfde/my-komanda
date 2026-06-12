import { NextRequest } from "next/server"
import { eq, and, inArray, isNull, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, followUpMessages, followUpCampaigns, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/vacancies/[id]/message-queue/clear
// Body: { scope?: "all" | "followups" | "rejections" }  (default: "all")
// Отменяет pending-сообщения очереди этой вакансии в одной транзакции:
//   followups  → follow_up_messages.status = 'cancelled'
//   rejections → candidates.pending_rejection_at = NULL
// Возвращает: { cancelledFollowups, cancelledRejections }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    const scope: "all" | "followups" | "rejections" = body.scope ?? "all"
    if (!["all", "followups", "rejections"].includes(scope)) {
      return apiError("scope должен быть 'all', 'followups' или 'rejections'", 400)
    }

    // Tenant-проверка: вакансия принадлежит компании
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    let cancelledFollowups = 0
    let cancelledRejections = 0

    await db.transaction(async (tx) => {
      // ── Follow-up сообщения ──────────────────────────────────────────────
      if (scope === "all" || scope === "followups") {
        // Находим кампании дожима по вакансии
        const campaignRows = await tx
          .select({ id: followUpCampaigns.id })
          .from(followUpCampaigns)
          .where(eq(followUpCampaigns.vacancyId, id))

        const campaignIds = campaignRows.map((c) => c.id)

        if (campaignIds.length > 0) {
          // Находим pending-сообщения этих кампаний
          const pendingMsgs = await tx
            .select({ id: followUpMessages.id })
            .from(followUpMessages)
            .where(
              and(
                eq(followUpMessages.status, "pending"),
                inArray(followUpMessages.campaignId, campaignIds),
              ),
            )

          if (pendingMsgs.length > 0) {
            const msgIds = pendingMsgs.map((m) => m.id)
            await tx
              .update(followUpMessages)
              .set({ status: "cancelled", errorMessage: "queue_cleared_by_hr" })
              .where(inArray(followUpMessages.id, msgIds))
            cancelledFollowups = pendingMsgs.length
          }
        }
      }

      // ── Pending-отказы ───────────────────────────────────────────────────
      if (scope === "all" || scope === "rejections") {
        // Кандидаты вакансии с ожидающим отказом (pending_rejection_at IS NOT NULL,
        // rejection_at IS NULL — отказ ещё не исполнен кроном)
        const pendingCands = await tx
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(
              eq(candidates.vacancyId, id),
              isNotNull(candidates.pendingRejectionAt),
              isNull(candidates.rejectionAt),
            ),
          )

        if (pendingCands.length > 0) {
          const candIds = pendingCands.map((c) => c.id)
          await tx
            .update(candidates)
            .set({ pendingRejectionAt: null })
            .where(inArray(candidates.id, candIds))
          cancelledRejections = pendingCands.length
        }
      }
    })

    return apiSuccess({ cancelledFollowups, cancelledRejections })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[message-queue/clear POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
