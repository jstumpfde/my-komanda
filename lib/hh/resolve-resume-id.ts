// Единый резолвер hh resume_id для кандидата — ОДИН источник правды для:
//   • GET /api/modules/hr/candidates/[id]/resume-pdf (скачивание PDF)
//   • GET /api/modules/hr/candidates/[id] (флаг hasResumePdf для UI-гейта
//     кнопки «Скачать PDF» в карточке кандидата)
//
// Без общего хелпера UI гейтился по hhRawData (наполняется ТОЛЬКО из
// hh_responses), а роут PDF умел резолвить resume_id ещё и напрямую из
// hh_candidates.hh_resume_id (легаси-импорт HHClient.importApplications,
// который писал в candidates+hh_candidates МИНУЯ hh_responses) — такие
// кандидаты видели disabled-кнопку, хотя PDF был доступен (predeploy-guard
// major, 14.07).
//
// Порядок фоллбэков:
//   1. hh_candidates.hh_resume_id — прямая связка candidate → resume_id
//      (легаси-импорт lib/hh/client.ts), самая надёжная.
//   2. hh_responses.raw_data.resume.id по local_candidate_id — основной
//      современный путь (import-responses.ts / cron).
//   3. hh_candidates.hh_application_id → hh_responses.hh_response_id →
//      raw_data.resume.id — когда local_candidate_id не проставлен.
//
// ВАЖНО (изоляция): хелпер НЕ проверяет принадлежность кандидата компании —
// вызывающий роут ОБЯЗАН сначала сделать JOIN candidates+vacancies с
// фильтром vacancies.companyId = user.companyId и только потом звать резолвер.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhResponses, hhCandidates } from "@/lib/db/schema"

interface HhRawResumeRef {
  resume?: { id?: string }
}

export async function resolveResumeId(candidateId: string, companyId: string): Promise<string | null> {
  const [link] = await db
    .select({
      hhResumeId: hhCandidates.hhResumeId,
      hhApplicationId: hhCandidates.hhApplicationId,
    })
    .from(hhCandidates)
    .where(eq(hhCandidates.candidateId, candidateId))
    .limit(1)
  if (link?.hhResumeId) return link.hhResumeId

  const [resp] = await db
    .select({ raw: hhResponses.rawData })
    .from(hhResponses)
    .where(and(eq(hhResponses.localCandidateId, candidateId), eq(hhResponses.companyId, companyId)))
    .limit(1)
  const raw1 = resp?.raw as HhRawResumeRef | null | undefined
  if (raw1?.resume?.id) return raw1.resume.id

  if (link?.hhApplicationId) {
    const [resp2] = await db
      .select({ raw: hhResponses.rawData })
      .from(hhResponses)
      .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.hhResponseId, link.hhApplicationId)))
      .limit(1)
    const raw2 = resp2?.raw as HhRawResumeRef | null | undefined
    if (raw2?.resume?.id) return raw2.resume.id
  }

  return null
}
