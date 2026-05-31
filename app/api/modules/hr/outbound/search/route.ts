// POST /api/modules/hr/outbound/search
//
// Исходящий подбор, Фаза 1. Принимает vacancy_id + criteria, дёргает hh
// GET /resumes (поиск — НЕ расходует лимит просмотров), сохраняет найденные
// резюме в outbound_candidates (status='found', дедуп по (vacancy_id,resume_id)),
// возвращает список сниппетов.
//
// Tenant guard: company_id = user.companyId на всех записях; vacancy
// проверяется на принадлежность компании перед поиском.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, outboundSearches, outboundCandidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { searchResumes, snippetExperienceYears, type OutboundCriteria, type ResumeSnippet } from "@/lib/hh/outbound"

interface SearchBody {
  vacancyId?: string
  criteria?: OutboundCriteria
}

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const companyId = user.companyId

  let body: SearchBody
  try {
    body = (await req.json()) as SearchBody
  } catch {
    return apiError("Некорректное тело запроса", 400)
  }

  const vacancyId = body.vacancyId
  if (!vacancyId) return apiError("vacancyId обязателен", 400)

  // Tenant guard: вакансия должна принадлежать компании пользователя.
  const [vac] = await db
    .select({ id: vacancies.id, hhVacancyId: vacancies.hhVacancyId })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
    .limit(1)
  if (!vac) return apiError("Вакансия не найдена", 404)

  const criteria: OutboundCriteria = {
    text: body.criteria?.text?.trim() || undefined,
    area: body.criteria?.area?.trim() || undefined,
    experience: body.criteria?.experience || undefined,
    salaryFrom: body.criteria?.salaryFrom ?? undefined,
    salaryTo: body.criteria?.salaryTo ?? undefined,
    period: body.criteria?.period ?? 30,
    perPage: Math.min(body.criteria?.perPage ?? 50, 100),
    page: body.criteria?.page ?? 0,
  }

  let result
  try {
    result = await searchResumes(companyId, criteria)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка поиска hh"
    return apiError(`Поиск hh не удался: ${msg}`, 502)
  }

  // Сохраняем/обновляем поиск (одна запись на пару). Для простоты Фазы 1 —
  // всегда новая запись поиска; история не агрегируется.
  const [search] = await db
    .insert(outboundSearches)
    .values({
      companyId,
      vacancyId,
      criteria,
      createdByUserId: user.id ?? null,
      lastRunAt: new Date(),
    })
    .returning()

  // Сохраняем найденные резюме. Дедуп по (vacancy_id, hh_resume_id):
  // повторные находки не плодят дубли и НЕ перетирают invited/responded.
  for (const item of result.items) {
    if (!item.id) continue
    const title = item.title ?? null
    await db
      .insert(outboundCandidates)
      .values({
        searchId: search.id,
        companyId,
        vacancyId,
        hhResumeId: item.id,
        title,
        snippet: item,
        status: "found",
      })
      .onConflictDoUpdate({
        target: [outboundCandidates.vacancyId, outboundCandidates.hhResumeId],
        // Обновляем снапшот и привязку к свежему поиску, но НЕ трогаем status,
        // чтобы уже приглашённые/ответившие не вернулись в 'found'.
        set: {
          searchId: search.id,
          title,
          snippet: item,
          updatedAt: new Date(),
        },
      })
  }

  // Возвращаем актуальный список по вакансии (с уже проставленными статусами,
  // чтобы UI скрыл приглашённых из дедупа).
  const saved = await db
    .select()
    .from(outboundCandidates)
    .where(and(eq(outboundCandidates.vacancyId, vacancyId), eq(outboundCandidates.companyId, companyId)))

  return apiSuccess({
    searchId: search.id,
    found: result.found,
    pages: result.pages,
    items: saved.map((c) => ({
      id: c.id,
      hhResumeId: c.hhResumeId,
      title: c.title,
      status: c.status,
      aiScore: c.aiScore,
      aiReasoning: c.aiReasoning,
      experienceYears: snippetExperienceYears((c.snippet ?? {}) as ResumeSnippet),
      area: (c.snippet as { area?: { name?: string } } | null)?.area?.name ?? null,
      salary: (c.snippet as { salary?: { amount?: number; currency?: string } } | null)?.salary ?? null,
    })),
  })
}
