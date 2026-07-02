import { NextRequest, NextResponse } from "next/server"
import { and, eq, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { candidates, demos, hhCandidates, vacancies } from "@/lib/db/schema"
import { generateCandidateShortId, isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { normalizePhone, normalizeEmail } from "@/lib/candidates/normalize-contacts"
// #19: scheduleAnketaConfirmation больше не вызываем — функция оставлена
// для совместимости с уже запланированными follow_up_messages, но новые
// записи теперь идут только через scheduleAnketaAutoReply (таб «Воронка»).
import { scheduleAnketaAutoReply } from "@/lib/messaging/anketa-auto-reply"
// Воронка v2: хук завершения анкеты (только при funnelV2RuntimeEnabled=true)
import { onAnketaCompleted } from "@/lib/funnel-v2/stage-completion-handler"

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

function buildSurveyResponses(body: {
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate?: string
  city?: string
  anketa?: AnketaPayload
}): Record<string, unknown> {
  // Снимок анкеты — кладётся в candidates.survey_responses (отдельное
  // поле, не в anketa_answers, чтобы не затирать массив демо-блоков).
  const out: Record<string, unknown> = {
    filledAt: new Date().toISOString(),
    firstName: body.firstName.trim(),
    lastName:  body.lastName.trim(),
    email:     body.email.trim(),
    phone:     body.phone.trim(),
  }
  if (body.city?.trim())      out.city      = body.city.trim()
  if (body.birthDate?.trim()) out.birthDate = body.birthDate.trim()
  if (body.anketa) {
    for (const [k, v] of Object.entries(body.anketa)) {
      if (typeof v === "string" && v.trim().length > 0) out[k] = v.trim()
    }
  }
  return out
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Анти-перебор предсказуемых short_id: не даём массово перезаписывать PII
    // чужих кандидатов (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "demo-apply")) {
      return NextResponse.json({ error: "Слишком много запросов, попробуйте позже" }, { status: 429 })
    }

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

    const surveyResponses = buildSurveyResponses(body)

    // Резолв: short_id или token. LEFT JOIN на hh_candidates чтобы
    // понять, привязана ли карточка к hh-резюме.
    const [existing] = await db
      .select({
        id: candidates.id,
        vacancyId: candidates.vacancyId,
        stage: candidates.stage,
        stageHistory: candidates.stageHistory,
        hhResumeId: hhCandidates.hhResumeId,
      })
      .from(candidates)
      .leftJoin(hhCandidates, eq(hhCandidates.candidateId, candidates.id))
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (existing) {
      const now = new Date().toISOString()
      const currentStage = existing.stage ?? "new"
      const stageHistory = (existing.stageHistory as StageHistoryEntry[] | null) || []
      // Если карточка привязана к hh-резюме — основные поля
      // (name/email/phone/city) берутся из hh.ru и не перезаписываются
      // тем, что кандидат указал в анкете. Анкетные данные живут только
      // в survey_responses и показываются отдельным блоком в UI.
      const isFromHh = !!existing.hhResumeId

      const updates: Record<string, unknown> = {
        surveyResponses,
        updatedAt: new Date(),
      }
      if (!isFromHh) {
        updates.name = `${body.firstName} ${body.lastName}`
        updates.email = body.email
        updates.phone = body.phone
        updates.city = body.city || null
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

      // #19: scheduleAnketaConfirmation удалён — старый блок «Подтверждение
      // после анкеты» в табе «Сообщения» больше нет. Единственный канал
      // авто-сообщения после анкеты — scheduleAnketaAutoReply (ниже),
      // настраивается в табе «Воронка» через PostDemoSettings.
      // F2/F3: легаси-автоответ (scheduleAnketaAutoReply, branch=anketa_auto_reply)
      // и v2-хук — ВЗАИМОИСКЛЮЧАЮЩИЕ. При активном движке v2 отвечает он; иначе —
      // легаси. Раньше легаси вызывался безусловно → при v2 был двойной авто-ответ.
      // Fire-and-forget: ошибка здесь не блокирует ответ кандидату.
      void (async () => {
        try {
          const [vac] = await db
            .select({ funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled, funnelV2StateJson: candidates.funnelV2StateJson })
            .from(vacancies)
            .innerJoin(candidates, eq(candidates.vacancyId, vacancies.id))
            .where(eq(candidates.id, existing.id))
            .limit(1)
          if (vac?.funnelV2RuntimeEnabled && vac?.funnelV2StateJson) {
            await onAnketaCompleted(existing.id)
          } else {
            void scheduleAnketaAutoReply({ candidateId: existing.id, vacancyId: existing.vacancyId })
          }
        } catch (err) {
          console.error("[demo/apply] анкета авто-ответ (v2/легаси) упал:", err instanceof Error ? err.message : err)
        }
      })()

      return NextResponse.json({ success: true, id: existing.id })
    }

    // Fallback: нет кандидата с таким токеном — создаём нового.
    // Берём первую активную вакансию из demos (исторический fallback).
    const [demo] = await db
      .select({ vacancyId: demos.vacancyId })
      .from(demos)
      .where(eq(demos.kind, "demo"))
      .limit(1)

    if (!demo?.vacancyId) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    // Дедупликация: тот же человек мог уже быть импортирован
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
            referralUuids: candidates.referralUuids,
            hhResumeId:    hhCandidates.hhResumeId,
          })
          .from(candidates)
          .leftJoin(hhCandidates, eq(hhCandidates.candidateId, candidates.id))
          .where(and(eq(candidates.vacancyId, demo.vacancyId), or(...dupConds)))
          .limit(1)
      : []

    if (dup) {
      const now    = new Date().toISOString()
      const currentStage = dup.stage ?? "new"
      const stageHistory = (dup.stageHistory as StageHistoryEntry[] | null) || []
      const refs   = (dup.referralUuids as string[] | null) ?? []
      const refsNext = refs.includes(token) ? refs : [...refs, token]
      const isFromHh = !!dup.hhResumeId

      const updates: Record<string, unknown> = {
        surveyResponses,
        referralUuids: refsNext,
        updatedAt:     new Date(),
      }
      if (!isFromHh) {
        updates.name  = `${body.firstName} ${body.lastName}`
        updates.email = body.email
        updates.phone = body.phone
        updates.city  = body.city || null
      }
      if (!FINAL_STAGES.has(currentStage) && ANKETA_ELIGIBLE.has(currentStage)) {
        updates.stage = "anketa_filled"
        updates.stageHistory = [
          ...stageHistory,
          { from: currentStage, to: "anketa_filled", at: now, reason: "anketa_submitted_dedup" },
        ]
      }

      await db.update(candidates).set(updates).where(eq(candidates.id, dup.id))

      // F2/F3 (dedup-ветка): легаси и v2 — ВЗАИМОИСКЛЮЧАЮЩИЕ (см. основную ветку).
      // При активном v2 — только v2; иначе легаси (с прежним условием по стадии).
      void (async () => {
        try {
          const [vac] = await db
            .select({ funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled, funnelV2StateJson: candidates.funnelV2StateJson })
            .from(vacancies)
            .innerJoin(candidates, eq(candidates.vacancyId, vacancies.id))
            .where(eq(candidates.id, dup.id))
            .limit(1)
          if (vac?.funnelV2RuntimeEnabled && vac?.funnelV2StateJson) {
            await onAnketaCompleted(dup.id)
          } else if (!FINAL_STAGES.has(currentStage) && ANKETA_ELIGIBLE.has(currentStage)) {
            void scheduleAnketaAutoReply({ candidateId: dup.id, vacancyId: demo.vacancyId })
          }
        } catch (err) {
          console.error("[demo/apply] анкета авто-ответ dedup (v2/легаси) упал:", err instanceof Error ? err.message : err)
        }
      })()

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
          surveyResponses,
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
