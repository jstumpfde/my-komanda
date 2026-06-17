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
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { CandidateSpecSchema, type SpecApiResponse } from "@/lib/core/spec/types"
import { buildSpecFromLegacy, type LegacyVacancyInput } from "@/lib/core/spec/from-legacy"
import { specToLegacy } from "@/lib/core/spec/to-legacy"
import { getSpec, saveSpec } from "@/lib/core/spec/store"
import type {
  VacancyRequirements,
  VacancyAiProcessSettings,
  VacancyStopFactors,
} from "@/lib/db/schema"

// Набор legacy-полей, которые нужны buildSpecFromLegacy
const LEGACY_SELECT = {
  id:                 vacancies.id,
  companyId:          vacancies.companyId,
  requirementsJson:   vacancies.requirementsJson,
  aiProcessSettings:  vacancies.aiProcessSettings,
  stopFactorsJson:    vacancies.stopFactorsJson,
  descriptionJson:    vacancies.descriptionJson,
} as const

/**
 * Dual-write: зеркалирует CandidateSpec в legacy-поля вакансии (MERGE).
 * Вызывается только при SPEC_MIRROR_TO_LEGACY === 'true'. Читает текущие
 * requirements_json / ai_process_settings / stop_factors_json, накладывает
 * патчи specToLegacy() (сохраняя остальные поля) и записывает обратно.
 */
async function mirrorSpecToLegacy(
  vacancyId: string,
  spec: Parameters<typeof specToLegacy>[0],
): Promise<void> {
  const [cur] = await db
    .select({
      requirementsJson:  vacancies.requirementsJson,
      aiProcessSettings: vacancies.aiProcessSettings,
      stopFactorsJson:   vacancies.stopFactorsJson,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)

  if (!cur) return

  const patches = specToLegacy(spec)

  const mergedRequirements: VacancyRequirements = {
    ...((cur.requirementsJson ?? {}) as VacancyRequirements),
    ...patches.requirementsJson,
  }
  const mergedAiSettings: VacancyAiProcessSettings = {
    ...((cur.aiProcessSettings ?? {}) as VacancyAiProcessSettings),
    ...patches.aiProcessSettings,
  }
  const mergedStopFactors: VacancyStopFactors = {
    ...((cur.stopFactorsJson ?? {}) as VacancyStopFactors),
    ...patches.stopFactorsJson,
  }

  await db
    .update(vacancies)
    .set({
      requirementsJson:  mergedRequirements,
      aiProcessSettings: mergedAiSettings,
      stopFactorsJson:   mergedStopFactors,
    })
    .where(eq(vacancies.id, vacancyId))
}

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

    // Этап 2: пороги анкеты живут в demos.post_demo_settings (kind='demo',
    // последняя по updated_at — тот же выбор, что в post-demo-settings API).
    const [demoRow] = await db
      .select({ postDemoSettings: demos.postDemoSettings })
      .from(demos)
      .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo")))
      .orderBy(sql`${demos.updatedAt} DESC`)
      .limit(1)

    // Fallback: собираем из legacy-полей
    const legacyInput: LegacyVacancyInput = {
      requirementsJson:  row.requirementsJson as LegacyVacancyInput["requirementsJson"],
      aiProcessSettings: row.aiProcessSettings as LegacyVacancyInput["aiProcessSettings"],
      stopFactorsJson:   row.stopFactorsJson as LegacyVacancyInput["stopFactorsJson"],
      descriptionJson:   row.descriptionJson as LegacyVacancyInput["descriptionJson"],
      postDemoSettings:  (demoRow?.postDemoSettings ?? null) as LegacyVacancyInput["postDemoSettings"],
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

    // Dual-write Spec → legacy ЗА ФЛАГОМ. По умолчанию SPEC_MIRROR_TO_LEGACY
    // не задан/не 'true' → НИЧЕГО не зеркалим (боевое поведение не меняется).
    if (process.env.SPEC_MIRROR_TO_LEGACY === "true") {
      try {
        await mirrorSpecToLegacy(vacancyId, parsed.data)
      } catch (mirrorErr) {
        // Зеркалирование не должно ронять сохранение Spec — логируем и идём дальше.
        console.warn(`[spec-mirror] vacancy=${vacancyId} — ошибка dual-write в legacy:`, mirrorErr)
      }
    }

    return apiSuccess<SpecApiResponse>({ spec: parsed.data, source: "spec" })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

// Разрешаем PATCH как псевдоним PUT (удобно для клиентского fetch с method PATCH)
export { PUT as PATCH }
