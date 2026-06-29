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
  // Для бэкфилла задержки/off-hours в Портрет (поля живут в legacy).
  firstMessagesChain:               vacancies.firstMessagesChain,
  firstMessageOffHoursEnabled:      vacancies.firstMessageOffHoursEnabled,
  firstMessageOffHoursDelaySeconds: vacancies.firstMessageOffHoursDelaySeconds,
  firstMessageOffHoursText:         vacancies.firstMessageOffHoursText,
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
 * ВСЕГДА-включённый синк МЕССЕДЖИНГА Портрета (текст приглашения + задержка +
 * нерабочее время) в legacy — НЕ за флагом SPEC_MIRROR_TO_LEGACY, потому что это
 * напрямую влияет на сообщения живым кандидатам и обязано быть единым во всех
 * местах (Портрет / таб «Сообщения» / крон). Пишет:
 *   - aiProcessSettings.inviteMessage      ← inviteLetter (читает крон)
 *   - firstMessagesChain[0].text/delay     ← inviteLetter / inviteDelaySeconds (редактор цепочки)
 *   - first_message_off_hours_enabled/_delay_seconds/_text ← off-hours поля Портрета
 * Пустые тексты НЕ затирают существующие.
 */
async function syncPortraitMessagingToLegacy(
  vacancyId: string,
  spec: {
    inviteLetter: string
    offHoursLetter: string
    resumeThresholds: { inviteDelaySeconds: number; offHoursEnabled: boolean; offHoursDelaySeconds: number }
  },
): Promise<void> {
  const text = spec.inviteLetter?.trim()
  const offText = spec.offHoursLetter?.trim()
  const rt = spec.resumeThresholds

  const [cur] = await db
    .select({
      aiProcessSettings:  vacancies.aiProcessSettings,
      firstMessagesChain: vacancies.firstMessagesChain,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!cur) return

  const updateSet: Record<string, unknown> = {}

  // Текст приглашения → inviteMessage (крон).
  if (text) {
    updateSet.aiProcessSettings = {
      ...((cur.aiProcessSettings ?? {}) as VacancyAiProcessSettings),
      inviteMessage: text,
    }
  }

  // Цепочка первых сообщений: шаг 1 — текст + задержка. Если цепочки нет —
  // создаём минимальную, чтобы задержка/текст из Портрета реально применялись.
  const chain = cur.firstMessagesChain
  if (Array.isArray(chain) && chain.length > 0) {
    updateSet.firstMessagesChain = (chain as Array<Record<string, unknown>>).map(
      (m, i) => (i === 0 ? { ...m, ...(text ? { text } : {}), delaySeconds: rt.inviteDelaySeconds } : m),
    )
  } else if (text) {
    updateSet.firstMessagesChain = [{ enabled: true, delaySeconds: rt.inviteDelaySeconds, text }]
  }

  // Нерабочее время → vacancy-колонки. enabled/delay — всегда (тумблеры),
  // текст — только непустой (не затираем существующий).
  updateSet.firstMessageOffHoursEnabled = rt.offHoursEnabled
  updateSet.firstMessageOffHoursDelaySeconds = rt.offHoursDelaySeconds
  if (offText) updateSet.firstMessageOffHoursText = offText

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
      // Задержка приглашения ← firstMessagesChain[0].delaySeconds (реальное значение).
      const chain0 = Array.isArray(row.firstMessagesChain) ? (row.firstMessagesChain as Array<{ delaySeconds?: number }>)[0] : null
      if (chain0 && typeof chain0.delaySeconds === "number") {
        specFromStore.resumeThresholds.inviteDelaySeconds = chain0.delaySeconds
      }
      // Нерабочее время ← vacancy-колонки.
      if (typeof row.firstMessageOffHoursEnabled === "boolean") {
        specFromStore.resumeThresholds.offHoursEnabled = row.firstMessageOffHoursEnabled
      }
      if (typeof row.firstMessageOffHoursDelaySeconds === "number") {
        specFromStore.resumeThresholds.offHoursDelaySeconds = row.firstMessageOffHoursDelaySeconds
      }
      if (!specFromStore.offHoursLetter?.trim() && typeof row.firstMessageOffHoursText === "string" && row.firstMessageOffHoursText.trim()) {
        specFromStore.offHoursLetter = row.firstMessageOffHoursText
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
      // Логируем ВСЕ проблемы — иначе 400 на сохранении Портрета не диагностируем
      // (видно только размер ответа в access-логе). Сообщение уходит и клиенту.
      console.warn(`[spec PUT] валидация не прошла vacancy=${vacancyId}:`,
        JSON.stringify(parsed.error.issues.map(i => ({ path: i.path.join("."), msg: i.message, code: i.code }))))
      return apiError(
        `Ошибка валидации: ${firstIssue?.path?.join(".") ?? ""} — ${firstIssue?.message ?? "неверные данные"}`,
        400,
      )
    }

    await saveSpec(vacancyId, parsed.data, user.id)

    // Месседжинг (текст приглашения + задержка + нерабочее время) синкаем в
    // legacy ВСЕГДА (не за флагом) — это влияет на сообщения кандидатам, обязано
    // быть единым в Портрете, «Сообщениях» и кроне.
    try {
      await syncPortraitMessagingToLegacy(vacancyId, parsed.data)
    } catch (mirrorErr) {
      console.warn("[spec] syncPortraitMessagingToLegacy failed:", mirrorErr)
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
