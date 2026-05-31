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

  // Допустимые значения hh-справочников (сверены с /dictionaries, /languages).
  // Фильтруем вход по белым спискам — мусор/инъекции в query не попадут.
  const EMPLOYMENT = new Set(["full", "part", "project", "volunteer", "probation"])
  const SCHEDULE = new Set(["fullDay", "shift", "flexible", "remote", "flyInFlyOut"])
  const EDUCATION = new Set(["secondary", "special_secondary", "unfinished_higher", "higher", "bachelor", "master", "candidate", "doctor"])
  const GENDER = new Set(["male", "female"])
  const RELOCATION = new Set(["living_or_relocation", "living", "living_but_relocation", "relocation"])
  const ORDER_BY = new Set(["relevance", "publication_time", "salary_desc", "salary_asc"])
  const LABEL = new Set([
    "only_with_photo", "only_with_salary", "only_with_age", "only_with_gender",
    "only_with_vehicle", "exclude_viewed_by_user_id", "exclude_viewed_by_employer_id",
    "only_in_responses",
  ])

  // Нормализация массива строк из body + фильтр по белому списку, дедуп.
  const pickArray = (raw: unknown, allowed: Set<string>): string[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const out = Array.from(new Set(raw.filter((v): v is string => typeof v === "string" && allowed.has(v))))
    return out.length ? out : undefined
  }
  const pickOne = (raw: unknown, allowed: Set<string>): string | undefined =>
    typeof raw === "string" && allowed.has(raw) ? raw : undefined

  // language: формат "{id}.{level}" — id ∈ [a-z]{2,3}, level из language_level.
  const LANG_LEVEL = new Set(["a1", "a2", "b1", "b2", "c1", "c2", "l1"])
  const language = Array.isArray(body.criteria?.language)
    ? Array.from(new Set(
        (body.criteria!.language as unknown[]).filter((v): v is string => {
          if (typeof v !== "string") return false
          const [id, level] = v.split(".")
          return /^[a-z]{2,3}$/.test(id ?? "") && LANG_LEVEL.has(level ?? "")
        }),
      ))
    : undefined

  // Возраст: клампим в разумный hh-диапазон 14..100, нормализуем порядок.
  const clampAge = (v: unknown): number | undefined => {
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return undefined
    return Math.max(14, Math.min(100, Math.round(n)))
  }
  let ageFrom = clampAge(body.criteria?.ageFrom)
  let ageTo = clampAge(body.criteria?.ageTo)
  if (ageFrom != null && ageTo != null && ageFrom > ageTo) {
    ;[ageFrom, ageTo] = [ageTo, ageFrom]
  }

  const criteria: OutboundCriteria = {
    text: body.criteria?.text?.trim() || undefined,
    area: body.criteria?.area?.trim() || undefined,
    experience: body.criteria?.experience || undefined,
    salaryFrom: body.criteria?.salaryFrom ?? undefined,
    salaryTo: body.criteria?.salaryTo ?? undefined,
    period: body.criteria?.period ?? 30,
    perPage: Math.min(body.criteria?.perPage ?? 50, 100),
    page: body.criteria?.page ?? 0,
    employment: pickArray(body.criteria?.employment, EMPLOYMENT),
    schedule: pickArray(body.criteria?.schedule, SCHEDULE),
    label: pickArray(body.criteria?.label, LABEL),
    language: language && language.length ? language : undefined,
    educationLevel: pickOne(body.criteria?.educationLevel, EDUCATION),
    gender: pickOne(body.criteria?.gender, GENDER),
    relocation: pickOne(body.criteria?.relocation, RELOCATION),
    orderBy: pickOne(body.criteria?.orderBy, ORDER_BY),
    ageFrom,
    ageTo,
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
