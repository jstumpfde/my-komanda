import { NextRequest, NextResponse } from "next/server"
import { and, eq, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { candidates, demos } from "@/lib/db/schema"
import { generateCandidateShortId, isShortId } from "@/lib/short-id"
import { normalizePhone, normalizeEmail } from "@/lib/candidates/normalize-contacts"

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
// Стейджи, из которых заполнение анкеты переводит в anketa_filled.
// Включает все ранние стадии (на случай регресса) и текущую decision.
const ANKETA_ELIGIBLE = new Set([
  "new",
  "primary_contact",
  "demo",
  "demo_opened",
  "decision",
])

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

    // Резолв: short_id или token.
    const [existing] = await db
      .select({
        id: candidates.id,
        vacancyId: candidates.vacancyId,
        stage: candidates.stage,
        stageHistory: candidates.stageHistory,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
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

      // F2.C: → anketa_filled (после расширения воронки промежуточный
      // стейдж между «Демо пройдено» и «AI-скрининг»). AI-скрининг
      // теперь — отдельный HR-шаг, не авто.
      if (!FINAL_STAGES.has(currentStage) && ANKETA_ELIGIBLE.has(currentStage)) {
        updates.stage = "anketa_filled"
        updates.stageHistory = [
          ...stageHistory,
          { from: currentStage, to: "anketa_filled", at: now, reason: "anketa_submitted" },
        ]
      }

      await db.update(candidates).set(updates).where(eq(candidates.id, existing.id))

      // AI-скрининг убран — оценка теперь только при завершении демо
      // (см. app/api/public/demo/[token]/answer/route.ts).

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

    // Дедупликация (ТЗ задача 3): тот же человек мог уже быть импортирован
    // с hh, но открыл публичную демо-ссылку другим путём. Прежде чем
    // создавать новую карточку — ищем существующую по нормализованным
    // (vacancy_id, phone) ИЛИ (vacancy_id, email).
    const phoneNorm = normalizePhone(body.phone)
    const emailNorm = normalizeEmail(body.email)
    const dupConds = []
    if (phoneNorm) {
      dupConds.push(sql`regexp_replace(coalesce(${candidates.phone}, ''), '\D', '', 'g') = ${phoneNorm}`)
    }
    if (emailNorm) {
      dupConds.push(sql`lower(trim(coalesce(${candidates.email}, ''))) = ${emailNorm}`)
    }
    const [dup] = dupConds.length > 0
      ? await db
          .select({
            id:            candidates.id,
            stage:         candidates.stage,
            stageHistory:  candidates.stageHistory,
            anketaAnswers: candidates.anketaAnswers,
            referralUuids: candidates.referralUuids,
          })
          .from(candidates)
          .where(and(eq(candidates.vacancyId, demo.vacancyId), or(...dupConds)))
          .limit(1)
      : []

    if (dup) {
      const prev   = (dup.anketaAnswers as Record<string, unknown> | null) ?? {}
      const merged = { ...prev, ...cleanAnketa }
      const now    = new Date().toISOString()
      const currentStage = dup.stage ?? "new"
      const stageHistory = (dup.stageHistory as StageHistoryEntry[] | null) || []
      const refs   = (dup.referralUuids as string[] | null) ?? []
      const refsNext = refs.includes(token) ? refs : [...refs, token]

      const updates: Record<string, unknown> = {
        name:          `${body.firstName} ${body.lastName}`,
        email:         body.email,
        phone:         body.phone,
        city:          body.city || null,
        anketaAnswers: merged,
        referralUuids: refsNext,
        updatedAt:     new Date(),
      }
      if (!FINAL_STAGES.has(currentStage) && ANKETA_ELIGIBLE.has(currentStage)) {
        updates.stage = "anketa_filled"
        updates.stageHistory = [
          ...stageHistory,
          { from: currentStage, to: "anketa_filled", at: now, reason: "anketa_submitted_dedup" },
        ]
      }

      await db.update(candidates).set(updates).where(eq(candidates.id, dup.id))
      return NextResponse.json({ success: true, id: dup.id, deduplicated: true })
    }

    const candidate = await db.transaction(async (tx) => {
      const short = await generateCandidateShortId(tx, demo.vacancyId)
      const [row] = await tx
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
          shortId: short?.shortId ?? null,
          sequenceNumber: short?.sequenceNumber ?? null,
        })
        .returning()
      return row
    })

    return NextResponse.json({ success: true, id: candidate.id }, { status: 201 })
  } catch (err) {
    console.error("demo apply error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

