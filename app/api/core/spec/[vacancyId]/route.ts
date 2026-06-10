/**
 * GET  /api/core/spec/[vacancyId]
 *   Возвращает CandidateSpec для вакансии.
 *   Если запись в vacancy_specs ещё нет — возвращает buildSpecFromLegacy +
 *   флаг source:"legacy".
 *
 * PUT  /api/core/spec/[vacancyId]
 *   Сохраняет CandidateSpec. Валидация через CandidateSpecSchema (zod).
 *
 * СТАТУС: СПЯЩИЙ КОД. Не используется рантаймом скоринга/чат-бота.
 * Авторизация: requireCompany — любой пользователь компании может читать/писать.
 * Для записи дополнительно проверяем, что вакансия принадлежит companyId.
 */

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { CandidateSpecSchema, type SpecApiResponse } from "@/lib/core/spec/types"
import { buildSpecFromLegacy, type LegacyVacancyInput } from "@/lib/core/spec/from-legacy"
import { getSpec, saveSpec } from "@/lib/core/spec/store"

// Набор legacy-полей, которые нужны buildSpecFromLegacy
const LEGACY_SELECT = {
  id:                 vacancies.id,
  companyId:          vacancies.companyId,
  requirementsJson:   vacancies.requirementsJson,
  aiProcessSettings:  vacancies.aiProcessSettings,
  stopFactorsJson:    vacancies.stopFactorsJson,
  descriptionJson:    vacancies.descriptionJson,
} as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vacancyId: string }> },
) {
  try {
    const user = await requireCompany()
    const { vacancyId } = await params

    // Проверяем принадлежность вакансии компании
    const [row] = await db
      .select(LEGACY_SELECT)
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    // Пробуем новый контур
    const specFromStore = await getSpec(vacancyId)
    if (specFromStore) {
      return apiSuccess<SpecApiResponse>({ spec: specFromStore, source: "spec" })
    }

    // Fallback: собираем из legacy-полей
    const legacyInput: LegacyVacancyInput = {
      requirementsJson:  row.requirementsJson as LegacyVacancyInput["requirementsJson"],
      aiProcessSettings: row.aiProcessSettings as LegacyVacancyInput["aiProcessSettings"],
      stopFactorsJson:   row.stopFactorsJson as LegacyVacancyInput["stopFactorsJson"],
      descriptionJson:   row.descriptionJson as LegacyVacancyInput["descriptionJson"],
    }

    const spec = buildSpecFromLegacy(legacyInput)
    return apiSuccess<SpecApiResponse>({ spec, source: "legacy" })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ vacancyId: string }> },
) {
  try {
    const user = await requireCompany()
    const { vacancyId } = await params

    // Проверяем принадлежность вакансии компании
    const [row] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    // Читаем и валидируем тело
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return apiError("Невалидный JSON", 400)
    }

    const parsed = CandidateSpecSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      return apiError(
        `Ошибка валидации: ${firstIssue?.path?.join(".") ?? ""} — ${firstIssue?.message ?? "неверные данные"}`,
        400,
      )
    }

    await saveSpec(vacancyId, parsed.data, user.id)

    return apiSuccess<SpecApiResponse>({ spec: parsed.data, source: "spec" })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

// Разрешаем PATCH как псевдоним PUT (удобно для клиентского fetch с method PATCH)
export { PUT as PATCH }
