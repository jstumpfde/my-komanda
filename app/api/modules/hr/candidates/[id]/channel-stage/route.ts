import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses, hhCandidates } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { getValidToken } from "@/lib/hh-helpers"

// Маппинг id стадии hh → русское название
const HH_STAGE_LABELS: Record<string, string> = {
  response:        "Отклик",
  consider:        "Первичный контакт",
  phone_interview: "Телефонное интервью",
  interview:       "Собеседование",
  assessment:      "Тестовое задание",
  offer:           "Оффер",
  hired:           "Принят",
  discard:         "Отказ",
  // hh иногда возвращает внутренние id со сложной схемой
  // Fallback задаётся ниже
}

// Resolves the hh negotiation id for a candidate that belongs to companyId.
// Mirrors the two-step lookup from app/api/modules/hr/candidates/[id]/route.ts:
// 1) via hh_responses.local_candidate_id
// 2) fallback via hh_candidates.hh_application_id → hh_responses
async function resolveNegotiationId(
  candidateId: string,
  companyId: string,
): Promise<string | null> {
  // Step 1: direct link via hh_responses.local_candidate_id
  const [direct] = await db
    .select({ hhResponseId: hhResponses.hhResponseId })
    .from(hhResponses)
    .where(
      and(
        eq(hhResponses.localCandidateId, candidateId),
        eq(hhResponses.companyId, companyId),
      ),
    )
    .limit(1)

  if (direct?.hhResponseId) return direct.hhResponseId

  // Step 2: fallback via hh_candidates (older import path)
  const [link] = await db
    .select({ hhApplicationId: hhCandidates.hhApplicationId })
    .from(hhCandidates)
    .where(eq(hhCandidates.candidateId, candidateId))
    .limit(1)

  if (!link?.hhApplicationId) return null

  const [resp] = await db
    .select({ hhResponseId: hhResponses.hhResponseId })
    .from(hhResponses)
    .where(
      and(
        eq(hhResponses.companyId, companyId),
        eq(hhResponses.hhResponseId, link.hhApplicationId),
      ),
    )
    .limit(1)

  return resp?.hhResponseId ?? null
}

// GET /api/modules/hr/candidates/[id]/channel-stage
// Returns live hh funnel stage for the candidate, fetched on-demand.
// Response: { channels: [{ channel, stageId, stageLabel }] }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id: candidateId } = await params
    const companyId = user.companyId

    // Security: verify candidate belongs to this company (via vacancy)
    const [ownership] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(
        and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)),
      )
      .limit(1)

    if (!ownership) {
      return apiError("Кандидат не найден", 404)
    }

    // Resolve hh negotiation id
    const negotiationId = await resolveNegotiationId(candidateId, companyId)
    if (!negotiationId) {
      return NextResponse.json({ channels: [] })
    }

    // Get valid hh access token for this company
    const tokenResult = await getValidToken(companyId)
    if (!tokenResult) {
      return NextResponse.json({ channels: [] })
    }

    // Fetch negotiation from hh API — GET /negotiations/{id}
    // The `state` object contains { id, name } of the current funnel stage.
    let hhData: { state?: { id?: string; name?: string } } | null = null
    try {
      const hhRes = await fetch(`https://api.hh.ru/negotiations/${negotiationId}`, {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "User-Agent": "Company24/1.0 (company24.pro)",
        },
      })
      if (hhRes.ok) {
        hhData = (await hhRes.json()) as { state?: { id?: string; name?: string } }
      } else {
        const errText = await hhRes.text()
        console.warn(`[channel-stage] hh GET /negotiations/${negotiationId} → ${hhRes.status}`, errText.slice(0, 200))
        return NextResponse.json({ channels: [], error: `hh ${hhRes.status}` })
      }
    } catch (err) {
      console.error("[channel-stage] hh fetch error", err instanceof Error ? err.message : err)
      return NextResponse.json({ channels: [], error: "Ошибка сети" })
    }

    const stateId = hhData?.state?.id ?? ""
    // Prefer our Russian label; fallback to hh's own name; then raw id
    const stageLabel =
      HH_STAGE_LABELS[stateId] ??
      (hhData?.state?.name || stateId || "Неизвестно")

    return NextResponse.json({
      channels: [
        {
          channel: "hh",
          stageId: stateId,
          stageLabel,
        },
      ],
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[channel-stage] unexpected error", err instanceof Error ? err.message : err)
    return NextResponse.json({ channels: [], error: "Внутренняя ошибка" })
  }
}
