import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses, hhCandidates } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { deriveCandidateName } from "@/lib/candidate-name"
import { getValidToken } from "@/lib/hh-helpers"

// GET /api/modules/hr/candidates/[id]/resume-pdf
//
// Проксирует готовый PDF резюме с hh.ru — часть HR не имеют доступа к базе
// резюме hh.ru напрямую (не подключён свой личный кабинет hh), но карточка
// кандидата уже открыта им внутри платформы. БЕЗ AI/LLM: hh отдаёт готовый
// PDF по прямой ссылке из GET /resumes/{id} → download.pdf.url, здесь только
// стримим байты кандидату токеном компании.
//
// Живьём проверено 14.07 (диагностический скрипт на проде, кандидат ИП
// Штумпф): GET /resumes/{id} → download.pdf.url → GET той ссылки с тем же
// Bearer-токеном → 200, Content-Type application/pdf, валидный %PDF-.
//
// НЕ кэшируем PDF на диск в этой версии — каждый клик заново идёт в hh
// (подписи в download-ссылках недолговечны, поэтому /resumes/{id} дёргаем
// каждый раз заново, а не сохраняем ссылку). Если станет узким местом —
// дисковый кэш с TTL по аналогии с lib/hh/save-candidate-photo.ts.
//
// Резолв resume_id — тем же двухпутевым способом, что и GET
// /api/modules/hr/candidates/[id] (см. getOwnedCandidate там же):
//   1. hh_candidates.hh_resume_id — легаси-импорт (lib/hh/client.ts),
//      прямая и самая надёжная связка candidate → resume_id.
//   2. hh_responses.raw_data.resume.id — основной путь (import-responses.ts
//      / cron), привязан к кандидату через local_candidate_id.
//   3. hh_candidates.hh_application_id → hh_responses.hh_response_id →
//      raw_data.resume.id — fallback, когда local_candidate_id не проставлен.

const HH_UA = "Company24/1.0 (company24.pro)"

interface HhRawResumeRef {
  resume?: { id?: string }
}

async function resolveResumeId(candidateId: string, companyId: string): Promise<string | null> {
  const [link] = await db
    .select({ hhResumeId: hhCandidates.hhResumeId })
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

  const [link2] = await db
    .select({ hhApplicationId: hhCandidates.hhApplicationId })
    .from(hhCandidates)
    .where(eq(hhCandidates.candidateId, candidateId))
    .limit(1)
  if (link2?.hhApplicationId) {
    const [resp2] = await db
      .select({ raw: hhResponses.rawData })
      .from(hhResponses)
      .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.hhResponseId, link2.hhApplicationId)))
      .limit(1)
    const raw2 = resp2?.raw as HhRawResumeRef | null | undefined
    if (raw2?.resume?.id) return raw2.resume.id
  }

  return null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Изоляция: кандидат должен принадлежать вакансии этой же компании.
    const [row] = await db
      .select({
        candidateId: candidates.id,
        name: candidates.name,
        anketaAnswers: candidates.anketaAnswers,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Кандидат не найден", 404)

    const resumeId = await resolveResumeId(id, user.companyId)
    if (!resumeId) {
      return apiError("У кандидата нет привязки к резюме hh.ru — PDF недоступен", 404)
    }

    const tokenInfo = await getValidToken(user.companyId)
    if (!tokenInfo) {
      return apiError("hh.ru не подключён или токен недоступен — переподключите интеграцию", 400)
    }

    // Шаг 1: свежие download-ссылки (подписи в них истекают — не кэшируем
    // между запросами, каждый клик дёргает /resumes/{id} заново).
    const resumeRes = await fetch(`https://api.hh.ru/resumes/${encodeURIComponent(resumeId)}`, {
      headers: { Authorization: `Bearer ${tokenInfo.accessToken}`, "User-Agent": HH_UA },
    })
    if (resumeRes.status === 403 || resumeRes.status === 410) {
      return apiError("Резюме скрыто или удалено кандидатом на hh.ru — PDF недоступен", 404)
    }
    if (resumeRes.status === 404) {
      return apiError("Резюме не найдено на hh.ru (возможно, удалено)", 404)
    }
    if (!resumeRes.ok) {
      const text = await resumeRes.text().catch(() => "")
      console.error(`[resume-pdf] GET /resumes/${resumeId} failed: ${resumeRes.status} ${text.slice(0, 300)}`)
      return apiError("hh.ru временно недоступен, попробуйте позже", 502)
    }

    const resumeJson = (await resumeRes.json()) as { download?: { pdf?: { url?: string } } }
    const pdfUrl = resumeJson.download?.pdf?.url
    if (!pdfUrl) {
      return apiError("hh.ru не предоставил PDF для этого резюме", 404)
    }

    // Шаг 2: сам PDF — тоже требует Bearer-токена (это эндпоинт api.hh.ru,
    // не публичный CDN-URL с подписью в query).
    const pdfRes = await fetch(pdfUrl, {
      headers: { Authorization: `Bearer ${tokenInfo.accessToken}`, "User-Agent": HH_UA },
    })
    if (!pdfRes.ok) {
      console.error(`[resume-pdf] download failed for resume ${resumeId}: ${pdfRes.status}`)
      return apiError("Не удалось скачать PDF с hh.ru", 502)
    }
    const buf = await pdfRes.arrayBuffer()

    const displayName = deriveCandidateName(row.name, row.anketaAnswers, null) || "Кандидат"
    // ASCII-фоллбэк — candidate id (валиден для старых клиентов без filename*);
    // человекочитаемое имя — в filename* (RFC 5987, UTF-8).
    const asciiFallback = `resume-${id}.pdf`
    const prettyName = `${displayName}.pdf`.replace(/[\\/:*?"<>|]/g, "")

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(prettyName)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[resume-pdf GET]", err)
    return apiError("Internal server error", 500)
  }
}
