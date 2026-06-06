// POST /api/modules/hr/outbound/score
//
// Порционный AI-скоринг найденных резюме ПО СНИППЕТАМ (лимит просмотров hh
// НЕ расходуется — полный GET /resumes/{id} здесь не делается).
// Переиспользует screenCandidate (lib/ai-screen-candidate) с анти-галлюцинационной
// логикой: low confidence → score ≤ 55. Пишет ai_score/ai_reasoning, возвращает
// ранжированный список (лучшие сверху).
//
// Режимы вызова:
//   { vacancyId }           — скорит ВСЕ без ai_score (old behavior, используется
//                             при обновлении статусов после приглашения)
//   { vacancyId, ids }      — скорит только переданные outbound_candidate.id
//                             (используется для порционного скоринга из UI:
//                             авто-топ-20, «Оценить ещё N», «Оценить выбранных»)
//
// AUTO_SCORE_LIMIT = 20 — константа в UI (outbound-sourcing-tab.tsx); сервер
// просто принимает список ids, не знает про лимит.
//
// Tenant guard: company_id = user.companyId на чтении и записи.

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, outboundCandidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { screenCandidate } from "@/lib/ai-screen-candidate"
import { snippetSummaryText, snippetExperienceYears, type ResumeSnippet } from "@/lib/hh/outbound"

interface ScoreBody {
  vacancyId?: string
  // Опционально — конкретные outbound_candidate id; иначе скорим все 'found'
  // без ai_score по вакансии.
  ids?: string[]
  // Мягкие критерии от HR/AI-генерации — добавляются к aiIdealProfile как
  // дополнительный контекст для скоринга.
  softCriteria?: string
}

// Из anketa вакансии (descriptionJson.anketa) собираем vacancyAnketa для
// screenCandidate — те же поля, что используются в hh-импорте/скрининге.
function buildVacancyAnketa(vac: {
  title: string | null
  city: string | null
  descriptionJson: unknown
}) {
  const anketa = ((vac.descriptionJson as Record<string, unknown> | null)?.anketa as Record<string, unknown> | undefined) ?? {}
  return {
    vacancyTitle: vac.title ?? undefined,
    positionCity: vac.city ?? undefined,
    requirements: (anketa.requirements as string | undefined) ?? undefined,
    responsibilities: (anketa.responsibilities as string | undefined) ?? undefined,
    requiredSkills: (anketa.requiredSkills as string[] | undefined) ?? undefined,
    desiredSkills: (anketa.desiredSkills as string[] | undefined) ?? undefined,
    experienceMin: (anketa.experienceMin as string | undefined) ?? undefined,
    aiIdealProfile: (anketa.aiIdealProfile as string | undefined) ?? undefined,
    aiStopFactors: (anketa.aiStopFactors as string[] | undefined) ?? undefined,
    aiRequiredHardSkills: (anketa.aiRequiredHardSkills as string[] | undefined) ?? undefined,
    aiMinExperience: (anketa.aiMinExperience as string | undefined) ?? undefined,
    aiWeights: (anketa.aiWeights as Record<string, string> | undefined) ?? undefined,
  }
}

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const companyId = user.companyId

  let body: ScoreBody
  try {
    body = (await req.json()) as ScoreBody
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }
  const vacancyId = body.vacancyId
  if (!vacancyId) return apiError("vacancyId обязателен", 400)

  const [vac] = await db
    .select({ id: vacancies.id, title: vacancies.title, city: vacancies.city, descriptionJson: vacancies.descriptionJson })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
    .limit(1)
  if (!vac) return apiError("Вакансия не найдена", 404)

  // Выборка кандидатов к скорингу (tenant guard по company_id).
  const conds = [
    eq(outboundCandidates.vacancyId, vacancyId),
    eq(outboundCandidates.companyId, companyId),
  ]
  if (body.ids?.length) conds.push(inArray(outboundCandidates.id, body.ids))
  const rows = await db.select().from(outboundCandidates).where(and(...conds))

  // Скорим только те, у кого ещё нет ai_score (idempotent), либо явно
  // переданы ids.
  const toScore = body.ids?.length ? rows : rows.filter((r) => r.aiScore == null)

  const anketa = buildVacancyAnketa(vac)
  const soft = body.softCriteria?.trim()
  const anketaWithSoft = soft
    ? { ...anketa, aiIdealProfile: [anketa.aiIdealProfile, soft].filter(Boolean).join("\n\nДополнительные мягкие критерии:\n") }
    : anketa
  let scored = 0

  for (const row of toScore) {
    const snippet = (row.snippet ?? {}) as ResumeSnippet
    try {
      const result = await screenCandidate({
        candidateData: {
          name: [snippet.first_name, snippet.last_name].filter(Boolean).join(" ") || (row.title ?? "Кандидат"),
          resume: snippetSummaryText(snippet),
          skills: snippet.skill_set ?? undefined,
          city: snippet.area?.name ?? undefined,
          salary: snippet.salary?.amount != null ? String(snippet.salary.amount) : undefined,
          experience: snippetExperienceYears(snippet) != null ? `${snippetExperienceYears(snippet)} лет` : undefined,
        },
        vacancyAnketa: anketaWithSoft,
      })
      const reasoning = [result.recommendation, ...(result.weaknesses ?? [])].filter(Boolean).join(" | ").slice(0, 1000)
      await db
        .update(outboundCandidates)
        .set({ aiScore: result.score, aiReasoning: reasoning || null, updatedAt: new Date() })
        .where(and(eq(outboundCandidates.id, row.id), eq(outboundCandidates.companyId, companyId)))
      scored++
    } catch (err) {
      console.warn(`[outbound/score] screenCandidate failed for ${row.id}:`, err instanceof Error ? err.message : err)
    }
  }

  // Возвращаем ранжированный список (лучшие сверху, null-score в конце).
  const fresh = await db
    .select()
    .from(outboundCandidates)
    .where(and(eq(outboundCandidates.vacancyId, vacancyId), eq(outboundCandidates.companyId, companyId)))

  const ranked = fresh
    .map((c) => ({
      id: c.id,
      hhResumeId: c.hhResumeId,
      title: c.title,
      status: c.status,
      aiScore: c.aiScore,
      aiReasoning: c.aiReasoning,
      experienceYears: snippetExperienceYears((c.snippet ?? {}) as ResumeSnippet),
      area: (c.snippet as { area?: { name?: string } } | null)?.area?.name ?? null,
      salary: (c.snippet as { salary?: { amount?: number; currency?: string } } | null)?.salary ?? null,
    }))
    .sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1))

  return apiSuccess({ scored, items: ranked })
}
