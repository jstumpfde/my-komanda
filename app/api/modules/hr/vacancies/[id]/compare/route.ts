// GET /api/modules/hr/vacancies/[id]/compare?ids=c1,c2,c3
//   ИЛИ ?set=<token> — короткий набор сравнения (таблица compare_sets).
// Единая выборка ответов нескольких кандидатов для страницы сравнения.
// Данные собирает lib/compare/build-comparison.ts (общий хелпер с публичным
// роутом по share-токену).
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, compareSets, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { buildComparison } from "@/lib/compare/build-comparison"
import { extractAllContacts } from "@/lib/hh/extract-resume-fields"

const MAX_COMPARE = 50

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await ctx.params
    const url = new URL(req.url)

    const [vac] = await db
      .select({ companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (vac.companyId !== user.companyId) return apiError("Forbidden", 403)

    // Источник id: либо короткий набор (?set=token), либо явный ?ids=.
    let ids: string[] = []
    const setToken = (url.searchParams.get("set") ?? "").trim()
    if (setToken) {
      const [row] = await db
        .select({ candidateIds: compareSets.candidateIds })
        .from(compareSets)
        .where(and(eq(compareSets.token, setToken), eq(compareSets.companyId, user.companyId), eq(compareSets.vacancyId, vacancyId)))
        .limit(1)
      if (!row) return apiError("Набор сравнения не найден", 404)
      ids = (Array.isArray(row.candidateIds) ? row.candidateIds : [])
        .filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX_COMPARE)
    } else {
      ids = (url.searchParams.get("ids") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE)
    }
    if (ids.length === 0) return apiError("ids required", 400)

    const result = await buildComparison(vacancyId, ids)
    if (result.candidates.length === 0) return apiError("No candidates", 404)

    // Город + дата рождения + телефон/предпочтительный контакт — только в
    // HR-роуте (в публичную ссылку не отдаём). Скоупим только кандидатов этой
    // вакансии + компании (tenant-изоляция).
    const info = await db
      .select({
        id: candidates.id,
        city: candidates.city,
        birthDate: candidates.birthDate,
        phone: candidates.phone,
        hhRawData: hhResponses.rawData,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .leftJoin(
        hhResponses,
        and(eq(hhResponses.localCandidateId, candidates.id), eq(hhResponses.companyId, user.companyId)),
      )
      .where(and(
        inArray(candidates.id, ids),
        eq(vacancies.id, vacancyId),
        eq(vacancies.companyId, user.companyId),
      ))
    const infoById = new Map(info.map((r) => [r.id, r]))
    const candidatesWithInfo = result.candidates.map((c) => {
      const row = infoById.get(c.id)
      // Предпочтительный способ связи из hh (extractAllContacts — общий
      // сборщик, не дублируем парсер) — показываем только если он НЕ телефон
      // (кнопка звонка уже есть отдельно из candidates.phone).
      const raw = row?.hhRawData as { resume?: unknown } | null | undefined
      const resume = raw && typeof raw === "object"
        ? (raw.resume ?? (("contact" in raw) ? raw : undefined))
        : undefined
      const allContacts = resume ? extractAllContacts(resume) : []
      const PHONE_TYPES = new Set(["cell", "home", "work"])
      const preferred = allContacts.find((c2) => c2.preferred && !PHONE_TYPES.has(c2.typeId)) ?? null
      return {
        ...c,
        city: row?.city ?? null,
        birthDate: row?.birthDate ?? null,
        phone: row?.phone ?? null,
        preferredContact: preferred
          ? { typeId: preferred.typeId, typeLabel: preferred.typeLabel, display: preferred.display, href: preferred.href, comment: preferred.comment }
          : null,
      }
    })

    return apiSuccess({ ...result, candidates: candidatesWithInfo })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
