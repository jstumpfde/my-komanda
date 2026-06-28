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

/**
 * ВСЕГДА-включённый синк текста приглашения Портрета (inviteLetter) в legacy —
 * НЕ за флагом SPEC_MIRROR_TO_LEGACY, потому что это текст, уходящий живым
 * кандидатам, и он обязан быть единым во всех местах. Пишет:
 *   - aiProcessSettings.inviteMessage (его читает крон process-queue),
 *   - firstMessagesChain[0].text (редактор цепочки в табе «Сообщения»),
 * чтобы Портрет, «Сообщения» и крон показывали/слали один текст.
 * Пустой inviteLetter НЕ затирает существующий inviteMessage.
 */
async function syncInviteTextToLegacy(vacancyId: string, inviteLetter: string): Promise<void> {
  const text = inviteLetter?.trim()
  if (!text) return

  const [cur] = await db
    .select({
      aiProcessSettings:  vacancies.aiProcessSettings,
      firstMessagesChain: vacancies.firstMessagesChain,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!cur) return

  const mergedAi: VacancyAiProcessSettings = {
    ...((cur.aiProcessSettings ?? {}) as VacancyAiProcessSettings),
    inviteMessage: text,
  }

  const updateSet: Record<string, unknown> = { aiProcessSettings: mergedAi }
  const chain = cur.firstMessagesChain
  if (Array.isArray(chain) && chain.length > 0) {
    updateSet.firstMessagesChain = (chain as Array<Record<string, unknown>>).map(
      (m, i) => (i === 0 ? { ...m, text } : m),
    )
  }

  await db.update(vacancies).set(updateSet).where(eq(vacancies.id, vacancyId))
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
      // Бэкфилл: текст приглашения мог быть задан в legacy (таб «Сообщения»)
      // до появления поля inviteLetter — показываем реальный текущий текст,
      // а не пустоту/дефолт.
      if (!specFromStore.inviteLetter?.trim()) {
        const legacyInvite = (row.aiProcessSettings as { inviteMessage?: string } | null)?.inviteMessage
        if (typeof legacyInvite === "string" && legacyInvite.trim()) {
          specFromStore.inviteLetter = legacyInvite
        }
      }
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
    // Портрет стартует ЧИСТО: не вываливаем легаси-навыки вакансии в «Что хотим
    // видеть» (раньше там оказывалось 15-20 навыков). HR заполняет осмысленными
    // критериями кнопкой «Сгенерировать критерии». Стоп-факторы/эталон/«Не
    // подходит» — оставляем (Юрий 26.06). Скоринг legacy-контура использует
    // requirementsJson напрямую и этим не затрагивается.
    const cleanSpec = { ...spec, mustHave: [], niceToHave: [] }
    return apiSuccess<SpecApiResponse>({ spec: cleanSpec, source: "legacy" })
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

    // Текст приглашения синкаем в legacy ВСЕГДА (не за флагом) — это текст
    // кандидату, обязан быть единым в Портрете, «Сообщениях» и кроне.
    try {
      await syncInviteTextToLegacy(vacancyId, parsed.data.inviteLetter)
    } catch (mirrorErr) {
      console.warn("[spec] syncInviteTextToLegacy failed:", mirrorErr)
    }

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
