// POST /api/modules/hr/outbound/invite
//
// Приглашает выбранные резюме откликнуться на вакансию через hh negotiations.
// Перед отправкой:
//   (а) проверяет доступ к базе резюме hh (checkResumeDatabaseAccess);
//   (б) проверяет дневной лимит просмотров (hh_resume_view_quota).
// Для каждого топового резюме: GET /resumes/{id} (РАСХОДУЕТ лимит → инкремент
// квоты) → приглашение через negotiations → создание кандидата в воронке
// (source='hh_outbound', стадия 'new' из lib/stages). Возвращает результат по
// каждому resume_id (ok/limit/error).
//
// Tenant guard: company_id = user.companyId на всех чтениях/записях.
//
// ВНИМАНИЕ: формат negotiations-приглашения требует верификации по доке hh
// (docs/employer_negotiations.md) — см. TODO в lib/hh/outbound.ts.

import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancies, outboundCandidates, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateShortId } from "@/lib/short-id"
import {
  getResume,
  inviteResumeToVacancy,
  checkResumeDatabaseAccess,
} from "@/lib/hh/outbound"
import { getQuota, incrementResumeViewQuota } from "@/lib/hh/outbound-quota"

interface InviteBody {
  vacancyId?: string
  hhResumeIds?: string[]
  message?: string
}

const DEFAULT_INVITE_MESSAGE =
  "Здравствуйте! Ваш опыт заинтересовал нас — приглашаем откликнуться на нашу вакансию."

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const companyId = user.companyId

  let body: InviteBody
  try {
    body = (await req.json()) as InviteBody
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }
  const vacancyId = body.vacancyId
  const hhResumeIds = (body.hhResumeIds ?? []).filter(Boolean)
  if (!vacancyId) return apiError("vacancyId обязателен", 400)
  if (hhResumeIds.length === 0) return apiError("Не выбрано ни одного резюме", 400)

  // Tenant guard + получаем hhVacancyId для negotiations.
  const [vac] = await db
    .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
    .limit(1)
  if (!vac) return apiError("Вакансия не найдена", 404)
  if (!vac.hhVacancyId) {
    return apiError("Вакансия не связана с hh.ru — приглашение невозможно", 400)
  }

  // (а) доступ к базе резюме.
  const access = await checkResumeDatabaseAccess(companyId)
  if (!access.hasAccess) {
    return apiError(access.reason ?? "Доступ к базе резюме hh не активен", 403)
  }

  // Загружаем выбранные outbound_candidates (tenant guard).
  const targets = await db
    .select()
    .from(outboundCandidates)
    .where(
      and(
        eq(outboundCandidates.vacancyId, vacancyId),
        eq(outboundCandidates.companyId, companyId),
        inArray(outboundCandidates.hhResumeId, hhResumeIds),
      ),
    )

  const byResume = new Map(targets.map((t) => [t.hhResumeId, t]))
  const message = (body.message?.trim() || DEFAULT_INVITE_MESSAGE).slice(0, 2000)

  const results: Array<{ hhResumeId: string; status: "ok" | "limit" | "error" | "skipped"; error?: string }> = []

  for (const resumeId of hhResumeIds) {
    const target = byResume.get(resumeId)
    if (!target) {
      results.push({ hhResumeId: resumeId, status: "error", error: "Резюме не найдено в результатах поиска" })
      continue
    }
    // Дедуп: уже приглашён — пропускаем.
    if (target.status === "invited" || target.status === "responded") {
      results.push({ hhResumeId: resumeId, status: "skipped", error: "Уже приглашён" })
      continue
    }

    // (б) лимит просмотров — проверяем перед каждым GET /resumes/{id}.
    const quota = await getQuota(companyId)
    if (quota.exhausted) {
      results.push({ hhResumeId: resumeId, status: "limit", error: "Дневной лимит просмотров резюме исчерпан" })
      continue
    }

    // GET /resumes/{id} — РАСХОДУЕТ лимит. Инкремент квоты сразу после успешного
    // запроса (просмотр уже состоялся на стороне hh).
    let full
    try {
      full = await getResume(companyId, resumeId)
      await incrementResumeViewQuota(companyId, 1)
      await db
        .update(outboundCandidates)
        .set({ status: "viewed", viewedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(outboundCandidates.id, target.id), eq(outboundCandidates.companyId, companyId)))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка просмотра резюме"
      if (/40[13]/.test(msg)) {
        results.push({ hhResumeId: resumeId, status: "error", error: "Доступ к базе резюме hh не активен" })
      } else {
        results.push({ hhResumeId: resumeId, status: "error", error: msg.slice(0, 200) })
      }
      continue
    }

    // Приглашение через negotiations (двухшаговый поток: GET applicable + POST).
    // Формат сверен с docs/employer_negotiations.md и hh OpenAPI (invite-applicant-to-vacancy).
    const inviteRes = await inviteResumeToVacancy(companyId, {
      hhVacancyId: vac.hhVacancyId,
      resumeId,
      message,
    })
    if (!inviteRes.ok) {
      results.push({ hhResumeId: resumeId, status: "error", error: inviteRes.error?.slice(0, 200) })
      continue
    }

    // Создаём кандидата в воронке (source='hh_outbound', стадия 'new').
    const fullName =
      [full.first_name, full.last_name].filter(Boolean).join(" ").trim() ||
      target.title ||
      "Кандидат с hh.ru"
    const phone =
      (full as { contact?: Array<{ type?: { id?: string }; value?: { formatted?: string; email?: string } }> }).contact?.find(
        (c) => c.type?.id === "cell",
      )?.value?.formatted ?? null
    const email =
      (full as { contact?: Array<{ type?: { id?: string }; value?: { formatted?: string; email?: string } }> }).contact?.find(
        (c) => c.type?.id === "email",
      )?.value?.email ?? null

    const newCandidate = await db.transaction(async (tx) => {
      const short = await generateCandidateShortId(tx, vacancyId)
      const [row] = await tx
        .insert(candidates)
        .values({
          vacancyId,
          name: fullName,
          phone,
          email,
          city: full.area?.name ?? null,
          source: "hh_outbound",
          stage: "new",
          score: target.aiScore ?? 50,
          resumeScore: target.aiScore ?? null,
          token: nanoid(32),
          shortId: short?.shortId ?? null,
          sequenceNumber: short?.sequenceNumber ?? null,
        })
        .returning()
      return row
    })

    await db
      .update(outboundCandidates)
      .set({ status: "invited", invitedAt: new Date(), candidateId: newCandidate.id, updatedAt: new Date() })
      .where(and(eq(outboundCandidates.id, target.id), eq(outboundCandidates.companyId, companyId)))

    results.push({ hhResumeId: resumeId, status: "ok" })
  }

  const quota = await getQuota(companyId)
  return apiSuccess({
    results,
    invited: results.filter((r) => r.status === "ok").length,
    quota: {
      viewsFromSearch: quota.viewsFromSearch,
      searchRemaining: quota.searchRemaining,
      totalViews: quota.totalViews,
      totalRemaining: quota.totalRemaining,
    },
  })
}
