import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { candidates, demos, vacancies } from "@/lib/db/schema"
import { screenCandidate } from "@/lib/ai-screen-candidate"

type AnketaPayload = {
  telegram?: string
  experienceSummary?: string
  portfolioUrl?: string
  hhUrl?: string
  otherLinks?: string
  employmentPreference?: string
  niches?: string
}

interface StageHistoryEntry {
  from: string | null
  to: string
  at: string
  reason: string
}

const FINAL_STAGES = new Set(["hired", "rejected"])
const ANKETA_ELIGIBLE = new Set(["new", "demo", "decision"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = (await req.json()) as {
      firstName: string
      lastName: string
      email: string
      phone: string
      birthDate?: string
      city?: string
      anketa?: AnketaPayload
    }

    if (!body.firstName || !body.lastName || !body.email || !body.phone) {
      return NextResponse.json({ error: "Заполните обязательные поля" }, { status: 400 })
    }

    // Готовим объект анкеты для jsonb. Пропускаем пустые значения.
    const cleanAnketa: Record<string, unknown> = {}
    if (body.anketa) {
      for (const [k, v] of Object.entries(body.anketa)) {
        if (typeof v === "string" && v.trim().length > 0) cleanAnketa[k] = v.trim()
      }
    }
    if (body.birthDate) cleanAnketa.birthDate = body.birthDate
    cleanAnketa.submittedAt = new Date().toISOString()

    // Find candidate by token
    const [existing] = await db
      .select({
        id: candidates.id,
        vacancyId: candidates.vacancyId,
        stage: candidates.stage,
        stageHistory: candidates.stageHistory,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (existing) {
      // Слияние с уже сохранёнными ответами (jsonb)
      const prev = (existing.anketaAnswers as Record<string, unknown> | null) ?? {}
      const merged = { ...prev, ...cleanAnketa }

      const now = new Date().toISOString()
      const currentStage = existing.stage ?? "new"
      const stageHistory = (existing.stageHistory as StageHistoryEntry[] | null) || []

      const updates: Record<string, unknown> = {
        name: `${body.firstName} ${body.lastName}`,
        email: body.email,
        phone: body.phone,
        city: body.city || null,
        anketaAnswers: merged,
        updatedAt: new Date(),
      }

      // F2.C: → ai_screening (только из new/demo/decision, без регресса)
      if (!FINAL_STAGES.has(currentStage) && ANKETA_ELIGIBLE.has(currentStage)) {
        updates.stage = "ai_screening"
        updates.stageHistory = [
          ...stageHistory,
          { from: currentStage, to: "ai_screening", at: now, reason: "anketa_submitted" },
        ]
      }

      await db.update(candidates).set(updates).where(eq(candidates.id, existing.id))

      // F3: fire-and-forget AI-скрининг
      void runAiScreening(existing.id, existing.vacancyId, cleanAnketa, body)
        .catch(err => console.error("[demo apply] AI screening failed:", err))

      return NextResponse.json({ success: true, id: existing.id })
    }

    // Fallback: нет кандидата с таким токеном — создаём нового.
    // Берём первую активную вакансию из demos (исторический fallback).
    const [demo] = await db
      .select({ vacancyId: demos.vacancyId })
      .from(demos)
      .limit(1)

    if (!demo?.vacancyId) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    const [candidate] = await db
      .insert(candidates)
      .values({
        vacancyId: demo.vacancyId,
        name: `${body.firstName} ${body.lastName}`,
        email: body.email,
        phone: body.phone,
        city: body.city || null,
        source: "demo",
        stage: "new",
        token: nanoid(12),
        anketaAnswers: cleanAnketa,
      })
      .returning()

    return NextResponse.json({ success: true, id: candidate.id }, { status: 201 })
  } catch (err) {
    console.error("demo apply error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function runAiScreening(
  candidateId: string,
  vacancyId: string,
  anketa: Record<string, unknown>,
  body: { firstName: string; lastName: string; city?: string },
) {
  const [vac] = await db
    .select({ title: vacancies.title, descriptionJson: vacancies.descriptionJson, city: vacancies.city })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)

  if (!vac) return

  const dj = (vac.descriptionJson as Record<string, unknown> | null) ?? {}
  const an = (dj.anketa as Record<string, unknown> | null) ?? {}

  const result = await screenCandidate({
    candidateData: {
      name: `${body.firstName} ${body.lastName}`,
      city: body.city,
      experience: typeof anketa.experienceSummary === "string" ? anketa.experienceSummary : undefined,
      resume: [
        anketa.experienceSummary,
        anketa.portfolioUrl ? `Портфолио: ${anketa.portfolioUrl}` : null,
        anketa.hhUrl ? `HH: ${anketa.hhUrl}` : null,
        anketa.niches ? `Ниши: ${anketa.niches}` : null,
      ].filter(Boolean).join("\n") || undefined,
    },
    vacancyAnketa: {
      vacancyTitle: vac.title,
      requirements: typeof an.requirements === "string" ? an.requirements : undefined,
      responsibilities: typeof an.responsibilities === "string" ? an.responsibilities : undefined,
      requiredSkills: Array.isArray(an.requiredSkills) ? an.requiredSkills.map(String) : undefined,
      desiredSkills: Array.isArray(an.desiredSkills) ? an.desiredSkills.map(String) : undefined,
      experienceMin: typeof an.experienceMin === "string" ? an.experienceMin : undefined,
      positionCity: vac.city ?? undefined,
    },
  })

  await db.update(candidates).set({
    aiScore: result.score,
    aiSummary: result.recommendation,
    aiDetails: [
      ...result.strengths.map(s => ({ question: "Сильная сторона", score: 1, comment: s })),
      ...result.weaknesses.map(w => ({ question: "Слабая сторона", score: 0, comment: w })),
    ],
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId))
}
