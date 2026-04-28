import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { candidates, hhCandidates, hhResponses, vacancies } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { classifyCandidateResponse, type ClassificationResult } from "@/lib/ai/classify-candidate-response"

// POST /api/integrations/hh/messages/classify
// Body: { hhResponseId: string, messageText: string }
// Запускает AI-классификацию ответа кандидата в hh-чате и применяет результат
// (rejection → перевод в rejected + прощальное сообщение; wants_personal_contact →
// перевод в wants_contact; busy_later/agreement/unclear → не двигаем).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const companyId = session.user.companyId

  let body: { hhResponseId?: unknown; messageText?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const hhResponseId = typeof body.hhResponseId === "string" ? body.hhResponseId : ""
  const messageText = typeof body.messageText === "string" ? body.messageText : ""
  if (!hhResponseId || !messageText) {
    return NextResponse.json({ error: "hhResponseId and messageText required" }, { status: 400 })
  }

  // 1. hh_responses → local candidate (идём через hh_candidates по hhApplicationId).
  const [resp] = await db
    .select()
    .from(hhResponses)
    .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.hhResponseId, hhResponseId)))
    .limit(1)
  if (!resp) {
    return NextResponse.json({ error: "hh response not found" }, { status: 404 })
  }

  let candidateId: string | null = resp.localCandidateId ?? null
  if (!candidateId) {
    const [link] = await db
      .select({ candidateId: hhCandidates.candidateId })
      .from(hhCandidates)
      .where(eq(hhCandidates.hhApplicationId, hhResponseId))
      .limit(1)
    candidateId = link?.candidateId ?? null
  }

  // Контекст для промта — название вакансии, если можем найти.
  let vacancyTitle: string | undefined
  if (candidateId) {
    const [row] = await db
      .select({ title: vacancies.title })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(eq(candidates.id, candidateId))
      .limit(1)
    vacancyTitle = row?.title
  }

  // 2. Классификация.
  const classification: ClassificationResult = await classifyCandidateResponse(messageText, {
    candidateName: resp.candidateName ?? undefined,
    vacancyTitle,
  })

  // 3. Применяем действие. Только rejection / wants_personal_contact двигают стадию;
  //    agreement / busy_later / unclear — только лог.
  let actionApplied: "moved_to_rejected" | "moved_to_wants_contact" | "logged" = "logged"
  let farewellSent = false

  if (candidateId && classification.intent === "rejection") {
    await db
      .update(candidates)
      .set({
        stage: "rejected",
        automationPaused: true,
        autoProcessingStopped: true,
        autoProcessingStoppedReason: "ai_classifier_rejection",
        autoProcessingStoppedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId))
    actionApplied = "moved_to_rejected"

    // Прощальное сообщение — одно, через hh API. Если не получится отправить —
    // не критично, просто залогируем.
    const tokenResult = await getValidToken(companyId)
    if (tokenResult && classification.farewellMessage) {
      try {
        const url = `https://api.hh.ru/negotiations/${hhResponseId}/messages`
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "User-Agent": "Company24.pro/1.0",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ message: classification.farewellMessage }).toString(),
        })
        if (res.ok) {
          farewellSent = true
        } else {
          const text = await res.text()
          console.warn(`[hh/classify] farewell failed: ${res.status} ${text}`)
        }
      } catch (err) {
        console.warn("[hh/classify] farewell exception:", err instanceof Error ? err.message : err)
      }
    }
  } else if (candidateId && classification.intent === "wants_personal_contact") {
    await db
      .update(candidates)
      .set({
        stage: "wants_contact",
        automationPaused: true,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId))
    actionApplied = "moved_to_wants_contact"
  } else if (classification.intent === "unclear") {
    console.info(
      `[hh/classify] unclear intent for response=${hhResponseId} confidence=${classification.confidence}`,
    )
  }

  return NextResponse.json({
    candidateId,
    classification,
    actionApplied,
    farewellSent,
  })
}
