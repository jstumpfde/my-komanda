import { NextRequest } from "next/server"
import { eq, and, count, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, followUpMessages, followUpCampaigns, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Проверка tenant: вакансия принадлежит компании пользователя
async function getVacancyForCompany(id: string, companyId: string) {
  const [vacancy] = await db
    .select({ id: vacancies.id, outboundPaused: vacancies.outboundPaused })
    .from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return vacancy ?? null
}

// GET /api/modules/hr/vacancies/[id]/message-queue
// { paused, pendingCount, pendingByBranch: {branch: n}, pendingRejections }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const vacancy = await getVacancyForCompany(id, user.companyId)
    if (!vacancy) return apiError("Вакансия не найдена", 404)

    // Кампании дожима по вакансии
    const campaignRows = await db
      .select({ id: followUpCampaigns.id })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.vacancyId, id))

    const campaignIds = campaignRows.map((c) => c.id)

    let pendingCount = 0
    const pendingByBranch: Record<string, number> = {}

    if (campaignIds.length > 0) {
      const pending = await db
        .select({ branch: followUpMessages.branch })
        .from(followUpMessages)
        .where(
          and(
            eq(followUpMessages.status, "pending"),
            inArray(followUpMessages.campaignId, campaignIds),
          ),
        )

      pendingCount = pending.length
      for (const row of pending) {
        const b = row.branch ?? "unknown"
        pendingByBranch[b] = (pendingByBranch[b] ?? 0) + 1
      }
    }

    // Pending-отказы: кандидаты вакансии с pending_rejection_at IS NOT NULL
    // и rejection_at IS NULL (отказ ещё не исполнен)
    const [rejResult] = await db
      .select({ cnt: count() })
      .from(candidates)
      .where(
        and(
          eq(candidates.vacancyId, id),
          isNotNull(candidates.pendingRejectionAt),
          isNull(candidates.rejectionAt),
        ),
      )

    const pendingRejections = Number(rejResult?.cnt ?? 0)

    return apiSuccess({
      paused:          vacancy.outboundPaused,
      pendingCount,
      pendingByBranch,
      pendingRejections,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[message-queue GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
