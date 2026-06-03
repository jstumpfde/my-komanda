// GET /api/modules/hr/vacancies/[id]/hh-stages
// ШАГ 1 (только чтение, без записи в hh): тянет у hh.ru коллекции и
// работодательские состояния воронки по привязанной вакансии. Нужен, чтобы
// увидеть реальные стадии (id + название), в т.ч. «Тестовое задание», и
// убедиться, что они отдаются через API — прежде чем писать смену состояния.
//
// Открыть залогиненным HR прямо в браузере:
//   /api/modules/hr/vacancies/<id>/hh-stages
import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getValidToken } from "@/lib/hh-helpers"

const HH_API_BASE = "https://api.hh.ru"
const USER_AGENT = "Company24.pro/1.0"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vac] = await db
      .select({ companyId: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (!vac.hhVacancyId) return apiError("Вакансия не привязана к hh.ru", 400)

    const token = await getValidToken(user.companyId)
    if (!token) return apiError("Нет валидного токена hh.ru", 400)

    // get-negotiations с vacancy_id → коллекции + работодательские состояния.
    const url = `${HH_API_BASE}/negotiations?vacancy_id=${encodeURIComponent(vac.hhVacancyId)}&per_page=1&page=0`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": USER_AGENT,
      },
    })
    const raw = await res.json().catch(() => null) as unknown
    if (!res.ok) {
      return apiError(`hh ${res.status}: ${JSON.stringify(raw)?.slice(0, 500)}`, 502)
    }

    // Достаём коллекции/состояния максимально терпимо к форме ответа.
    const r = raw as Record<string, unknown> | null
    const collections = Array.isArray(r?.collections) ? (r!.collections as Record<string, unknown>[]) : []
    const stages = collections.map((c) => ({
      id:    c.id,
      name:  c.name,
      employerState: (c as { employer_state?: unknown }).employer_state ?? null,
      counters: (c as { counters?: unknown }).counters ?? null,
    }))

    return apiSuccess({
      vacancyTitle: vac.title,
      hhVacancyId: vac.hhVacancyId,
      stages,
      // На случай, если стадии лежат в другом месте ответа — отдаём верхние
      // ключи и сырой ответ (обрезанный), чтобы посмотреть структуру.
      rawTopLevelKeys: r ? Object.keys(r) : [],
      raw,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
