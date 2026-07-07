/**
 * GET  /api/core/spec/[vacancyId]
 *   Возвращает CandidateSpec для вакансии.
 *   Если запись в vacancy_specs ещё нет — возвращает buildSpecFromLegacy +
 *   флаг source:"legacy".
 *
 * PUT  /api/core/spec/[vacancyId]
 *   Сохраняет CandidateSpec. Валидация через CandidateSpecSchema (zod).
 *
 * СТАТУС (уточнено 07.07 — старый комментарий "спящий код" устарел):
 * vacancy_specs читается рантаймом AI-скоринга резюме (lib/hh/process-queue.ts
 * → getSpec(), гейт isSpecScoringEnabled, включён по умолчанию для всех
 * вакансий) — Spec НЕ спит. НЕ используется только чат-ботом. Жёсткий
 * авто-отказ (matchStopFactors) по-прежнему читает исключительно
 * vacancies.stop_factors_json напрямую (не Spec) — см. syncStopFactorsToLegacy
 * ниже, который держит их в синхроне при сохранении здесь.
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
 * ВСЕГДА-включённый синк СТОП-ФАКТОРОВ Портрета в боевое хранилище — НЕ за
 * флагом SPEC_MIRROR_TO_LEGACY (unify 07.07, инцидент вакансии 2604V023).
 *
 * КОНТЕКСТ: до этой правки spec.stopFactors (редактор «Портрет»,
 * components/vacancies/spec-editor.tsx) сохранялся ТОЛЬКО в vacancy_specs —
 * отдельный карман, полностью отвязанный от vacancies.stop_factors_json
 * (единственное, что реально читает lib/hh/process-queue.ts →
 * matchStopFactors() для жёсткого авто-отказа кандидатов hh.ru). Полный
 * dual-write mirrorSpecToLegacy() уже существовал, но был спрятан за
 * SPEC_MIRROR_TO_LEGACY (по умолчанию OFF) и заодно трогал requirementsJson/
 * aiProcessSettings — более широкий и рискованный охват, чем нужно здесь.
 * Эта функция — узкий срез: синкает ТОЛЬКО stopFactors, всегда, аналогично
 * syncPortraitMessagingToLegacy ниже (та же схема: критично для реального
 * поведения кандидатов → не должно зависеть от флага).
 *
 * MERGE поверх текущего боевого stopFactorsJson (не перезапись) — сохраняет
 * rejectionText и любые факторы, заданные через «Настройки вакансии»
 * (vacancy-stop-factors-settings.tsx), которых нет в Spec-редакторе (сейчас
 * таких нет — оба редактора покрывают один набор ключей, но merge защищает
 * от будущего расхождения). Только ключи из specToLegacy().stopFactorsJson —
 * т.е. только те, что boевое хранилище вообще понимает (city/format/age/
 * experience/documents/citizenship/salaryExpectation); Spec-only поля
 * (driverLicense/jobHopping/timezone/customFactors) остаются только в Spec —
 * у них нет эквивалента в жёстком матчере, они уже учитываются отдельно как
 * мягкие AI-нокауты (см. lib/core/spec/resume-input.ts).
 */
async function syncStopFactorsToLegacy(
  vacancyId: string,
  spec: Parameters<typeof specToLegacy>[0],
): Promise<void> {
  const patch = specToLegacy(spec).stopFactorsJson
  if (Object.keys(patch).length === 0) return

  const [cur] = await db
    .select({ stopFactorsJson: vacancies.stopFactorsJson })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!cur) return

  const merged: VacancyStopFactors = { ...((cur.stopFactorsJson ?? {}) as VacancyStopFactors), ...patch }
  await db.update(vacancies).set({ stopFactorsJson: merged }).where(eq(vacancies.id, vacancyId))
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
      // unify 07.07: боевое vacancies.stop_factors_json — источник истины
      // (process-queue читает его напрямую, независимо от Spec). Существующие
      // Spec-записи, сохранённые ДО того, как PUT начал синкать stopFactors в
      // legacy (см. syncStopFactorsToLegacy выше), могли разойтись с боевым —
      // показываем в Портрете реальное боевое состояние по всем 8 ключам,
      // которые boевое хранилище понимает (city/format/age/experience/
      // documents/citizenship/nativeLanguage/salaryExpectation), не трогая
      // Spec-only поля (driverLicense/jobHopping/timezone/customFactors —
      // своего эквивалента в боевом нет).
      //
      // БАГФИКС (ревью): nativeLanguage изначально был пропущен в этом списке,
      // хотя это полноправный боевой ключ, редактируемый и в spec-editor
      // (native-language-factor-field.tsx), и в «Настройках вакансии» — без
      // него смена родного языка через «Настройки вакансии» не отражалась бы
      // в Портрете при следующем открытии (тот же рассинхрон, только в
      // обратную сторону).
      const boevoeStops = (row.stopFactorsJson ?? {}) as VacancyStopFactors
      specFromStore.stopFactors = {
        ...specFromStore.stopFactors,
        ...(boevoeStops.city              !== undefined ? { city: boevoeStops.city }                           : {}),
        ...(boevoeStops.format            !== undefined ? { format: boevoeStops.format }                       : {}),
        ...(boevoeStops.age               !== undefined ? { age: boevoeStops.age }                             : {}),
        ...(boevoeStops.experience        !== undefined ? { experience: boevoeStops.experience }                : {}),
        ...(boevoeStops.documents         !== undefined ? { documents: boevoeStops.documents }                  : {}),
        ...(boevoeStops.citizenship       !== undefined ? { citizenship: boevoeStops.citizenship }              : {}),
        ...(boevoeStops.nativeLanguage    !== undefined ? { nativeLanguage: boevoeStops.nativeLanguage }        : {}),
        ...(boevoeStops.salaryExpectation !== undefined ? { salaryExpectation: boevoeStops.salaryExpectation }  : {}),
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

    // Стоп-факторы синкаем в боевое хранилище ВСЕГДА (не за флагом) — unify
    // 07.07, см. комментарий над syncStopFactorsToLegacy выше. Это единственный
    // способ, которым «Портрет» реально влияет на жёсткий авто-отказ hh.ru;
    // без синка редактирование стоп-факторов в Портрете было бы такой же
    // иллюзией, как раньше был конструктор вакансии.
    try {
      await syncStopFactorsToLegacy(vacancyId, parsed.data)
    } catch (syncErr) {
      console.warn("[spec] syncStopFactorsToLegacy failed:", syncErr)
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
