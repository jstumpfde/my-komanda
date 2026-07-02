/**
 * lib/core/spec/from-legacy.ts
 *
 * Мост: ЧТЕНИЕ CandidateSpec из legacy-полей вакансии.
 * Чистая функция без серверных зависимостей (DB, SDK, fs).
 *
 * СТАТУС: БОЕВОЙ КОНТУР (fallback). Вызывается из /api/core/spec (GET) и из
 * боевого rediscovery-роута как fallback, когда сохранённого Spec ещё нет.
 * Обратное преобразование (Spec → legacy) — см. to-legacy.ts.
 *
 * Маппинг legacy → CandidateSpec:
 *
 * | Legacy поле                             | → Spec поле                        | Примечание                                |
 * |-----------------------------------------|------------------------------------|-------------------------------------------|
 * | requirementsJson.must_have              | mustHave                           | v2; []= v2 не настроен                    |
 * | requirementsJson.nice_to_have           | niceToHave                         | v2                                        |
 * | requirementsJson.deal_breakers          | dealBreakers                       | v2                                        |
 * | requirementsJson.scoring_weights        | scoringWeights                     | v2; дефолт DEFAULT_SCORING_WEIGHTS        |
 * | requirementsJson.ideal_profile          | idealProfile                       | v2, приоритет над anketa.aiIdealProfile   |
 * | aiProcessSettings.minScoreUpper         | resumeThresholds.upperThreshold    | резюме; дефолт 75                         |
 * | aiProcessSettings.minScoreLower         | resumeThresholds.lowerThreshold    | резюме; fallback minScore; дефолт 40      |
 * | aiProcessSettings.midRangeAction        | resumeThresholds.midRangeAction    | резюме; дефолт direct_demo                |
 * | aiProcessSettings.autoRejectEnabled     | resumeThresholds.autoRejectEnabled |                                           |
 * | aiProcessSettings.rejectionDelayMinutes | resumeThresholds.rejectionDelayMinutes | дефолт 300                            |
 * | demos.postDemoSettings.upperThreshold   | anketaThresholds.upperThreshold    | анкета (kind='demo'); дефолт 75           |
 * | demos.postDemoSettings.lowerThreshold   | anketaThresholds.lowerThreshold    | анкета; дефолт 50                         |
 * | stopFactorsJson                         | stopFactors                        | прямой маппинг                            |
 * | descriptionJson.anketa.aiIdealProfile   | idealProfile (fallback)            | если requirementsJson.ideal_profile пуст  |
 * | descriptionJson.anketa.aiRequiredHardSkills | portraitRequiredSkills         | «Портрет кандидата» v1                    |
 * | descriptionJson.anketa.desiredSkills    | portraitNiceSkills                 | «Портрет кандидата» v1                    |
 * | descriptionJson.anketa.aiStopFactors    | portraitKnockouts                  | текстовые нокауты v1                      |
 * | descriptionJson.anketa.aiCustomCriteria | customCriteria                     | произвольные оси HR                       |
 * | outboundSoftCriteria                    | outboundSoftCriteria               | передаётся явно (из outbound_searches)    |
 *
 * СПОРНЫЕ РЕШЕНИЯ:
 * 1. [ЗАКРЫТО, Этап 2] Пороги анкеты vs пороги резюме: в Spec ДВЕ пары —
 *    resumeThresholds (из aiProcessSettings, 75/40) и anketaThresholds
 *    (из demos.postDemoSettings kind='demo', 75/50). Пороги анкеты живут
 *    в таблице demos (НЕ в descriptionJson.anketa, как предполагалось ранее) —
 *    поэтому передаются в LegacyVacancyInput отдельным полем postDemoSettings
 *    (API-роут делает запрос к demos сам).
 * 2. Идеальный профиль: если заполнены оба (v2 requirementsJson.ideal_profile и
 *    v1 anketa.aiIdealProfile) — берём requirementsJson (более структурированный).
 * 3. portaitRequiredSkills vs mustHave: НЕ объединяем автоматически, храним оба.
 *    При активации нового скоринга потребителю нужно выбрать источник вручную.
 *    Разовый перенос v1→v2 — кнопкой в UI spec-editor (Этап 2, п.3).
 */

import type { CandidateSpec, MustHaveItem } from "./types"
import { DEFAULT_SCORING_WEIGHTS } from "./types"
import type { VacancyRequirements, VacancyAiProcessSettings, VacancyStopFactors } from "@/lib/db/schema"

// ─── Типы входных данных ─────────────────────────────────────────────────────

/**
 * Минимальный срез полей вакансии, необходимый для buildSpecFromLegacy.
 * Намеренно nullable — отражает реальное состояние БД (jsonb-поля могут быть null).
 */
export interface LegacyVacancyInput {
  requirementsJson?:   VacancyRequirements | null
  aiProcessSettings?:  VacancyAiProcessSettings | null | Record<string, unknown>
  stopFactorsJson?:    VacancyStopFactors | null
  /**
   * descriptionJson — jsonb, содержит anketa, finalScreens, pipeline и т.д.
   * Нас интересует только подполе anketa с «Портретом кандидата».
   */
  descriptionJson?:    Record<string, unknown> | null
  /**
   * «Мягкие критерии» из outbound-кампании. Передаётся снаружи (не в vacancies).
   * Если не нужен — просто не передавайте.
   */
  outboundSoftCriteria?: string | null
  /**
   * Этап 2: настройки AI-скрининга анкеты из demos.post_demo_settings
   * (запись kind='demo', последняя по updated_at). Передаётся снаружи —
   * требует отдельного запроса к таблице demos, API-роут делает его сам.
   * Нас интересуют только upperThreshold/lowerThreshold.
   */
  postDemoSettings?: { upperThreshold?: number; lowerThreshold?: number } | null
}

// ─── Утилиты ────────────────────────────────────────────────────────────────

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function num(v: unknown, def: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v)
  return def
}

function bool(v: unknown, def: boolean): boolean {
  if (typeof v === "boolean") return v
  return def
}

function validMidRange(v: unknown): "direct_demo" | "prequalification" | "keep_new" {
  if (v === "prequalification" || v === "direct_demo" || v === "keep_new") return v
  // Маппинг legacy-поля belowThresholdAction: "keep_new" → keep_new, всё остальное → direct_demo
  return "direct_demo"
}

// ─── Основная функция ────────────────────────────────────────────────────────

/**
 * Собирает CandidateSpec из legacy-полей вакансии.
 *
 * Не делает запросов к БД. Не бросает исключения (только console.warn при
 * проблемах с данными). Всегда возвращает корректный CandidateSpec.
 */
export function buildSpecFromLegacy(vacancy: LegacyVacancyInput): CandidateSpec {
  const req   = (vacancy.requirementsJson ?? {}) as VacancyRequirements
  const ai    = (vacancy.aiProcessSettings ?? {}) as VacancyAiProcessSettings
  const stops = (vacancy.stopFactorsJson ?? {}) as VacancyStopFactors
  const desc  = (vacancy.descriptionJson ?? {}) as Record<string, unknown>
  const anketa = (desc.anketa && typeof desc.anketa === "object"
    ? desc.anketa
    : {}) as Record<string, unknown>

  // ── (a) Оценочные критерии ───────────────────────────────────────────────

  // mustHave: legacy-строки → объекты { text, hard:true } (этап 2 «Портрет»).
  // Все из legacy трактуются как hard — поведение прежнее (нокаут включится
  // в этапе 2; сейчас рантайм читает только текст).
  const mustHave: MustHaveItem[] = strArr(req.must_have)
    .slice(0, 10)
    .map(text => ({ text, hard: true }))
  const niceToHave   = strArr(req.nice_to_have).slice(0, 10)
  const dealBreakers = strArr(req.deal_breakers).slice(0, 10)

  // scoring_weights: берём из requirementsJson; если невалидны — DEFAULT.
  // Этап 2: требование Σ=100 СНЯТО — движок нормирует на фактическую сумму,
  // поэтому принимаем любые валидные веса (все 9 осей — числа).
  const rawWeights = req.scoring_weights
  let scoringWeights = DEFAULT_SCORING_WEIGHTS
  if (rawWeights && typeof rawWeights === "object") {
    const keys = Object.keys(DEFAULT_SCORING_WEIGHTS) as (keyof typeof DEFAULT_SCORING_WEIGHTS)[]
    const weightsAsAny = rawWeights as unknown as Record<string, unknown>
    const allPresent = keys.every(k => typeof weightsAsAny[k] === "number")
    if (allPresent) {
      scoringWeights = rawWeights as unknown as typeof DEFAULT_SCORING_WEIGHTS
    }
  }

  // aiCustomCriteria: кастомные оси оценки из «Портрета» (lib/scoring/vacancy-spec.ts)
  const rawCustom = anketa.aiCustomCriteria
  const customCriteria: CandidateSpec["customCriteria"] = []
  if (Array.isArray(rawCustom)) {
    for (const item of rawCustom as Array<Record<string, unknown>>) {
      if (!item || typeof item !== "object") continue
      const label = str(item.label)
      if (!label) continue
      const weight = (["critical", "important", "nice", "irrelevant"].includes(str(item.weight))
        ? item.weight : "important") as CandidateSpec["customCriteria"][0]["weight"]
      if (weight === "irrelevant") continue
      // Новые поля этапа 2 (hardness/importance/aiMode) читаем из legacy, если
      // есть, иначе — дефолты схемы (soft / 50 / context). Поведение прежнее.
      const hardness = item.hardness === "hard" ? "hard" : "soft"
      const importance = typeof item.importance === "number" && Number.isFinite(item.importance)
        ? Math.max(0, Math.min(100, Math.round(item.importance)))
        : 50
      const aiMode = item.aiMode === "instruction" || item.aiMode === "hidden" ? item.aiMode : "context"
      customCriteria.push({
        key:    str(item.key) || `custom_${customCriteria.length}`,
        label,
        weight,
        hint:   str(item.hint) || undefined,
        hardness,
        importance,
        aiMode,
      })
    }
  }

  // ── (b) Стоп-факторы ─────────────────────────────────────────────────────
  // Прямой маппинг VacancyStopFactors → StopFactors (структура идентична).
  // Включаем только те ключи, для которых есть данные — не добавляем ключи
  // со значением undefined (deepEqual в тестах и JSON.stringify отличают).
  const stopFactors: CandidateSpec["stopFactors"] = {}
  if (stops.city)              stopFactors.city              = { ...stops.city }
  if (stops.format)            stopFactors.format            = { ...stops.format }
  if (stops.age)               stopFactors.age               = { ...stops.age }
  if (stops.experience)        stopFactors.experience        = { ...stops.experience }
  if (stops.documents)         stopFactors.documents         = { ...stops.documents }
  if (stops.citizenship)       stopFactors.citizenship       = { ...stops.citizenship }
  if (stops.salaryExpectation) stopFactors.salaryExpectation = { ...stops.salaryExpectation }

  // ── (c) Пороги и маршрутизация (Этап 2: две пары) ─────────────────────────
  // Пороги резюме — из aiProcessSettings (legacy v1: minScore → lower).
  const upper      = num(ai.minScoreUpper, 75)
  const lower      = num(ai.minScoreLower ?? (ai as Record<string, unknown>).minScore, 40)
  const midRange   = validMidRange(ai.midRangeAction ?? (ai as Record<string, unknown>).belowThresholdAction)
  const autoReject = bool(ai.autoRejectEnabled, false)
  const rejDelay   = num(ai.rejectionDelayMinutes, 300)

  const resumeThresholds: CandidateSpec["resumeThresholds"] = {
    enabled:              true,   // legacy не имел тумблера — оценка резюме всегда активна
    upperThreshold:       Math.max(0, Math.min(100, upper)),
    lowerThreshold:       Math.max(0, Math.min(100, lower)),
    midRangeAction:       midRange,
    autoRejectEnabled:    autoReject,
    autoInviteEnabled:    bool((ai as Record<string, unknown>).autoInviteEnabled, false),  // legacy не звал автоматически
    inviteNextStep:       "demo",
    inviteHhStage:        "consider",   // дефолт «Первичный контакт» (решение Юрия 28.06)
    inviteContentBlockId: null,
    inviteDelaySeconds:   180,          // реальное значение подтянет GET-бэкфилл из цепочки
    offHoursEnabled:      true,
    offHoursDelaySeconds: 15,
    rejectionDelayMinutes: Math.max(0, rejDelay),
  }

  // Пороги анкеты — из demos.postDemoSettings (передаётся снаружи). Дефолты 75/50
  // (как в UI PostDemoSettings, components/vacancies/post-demo-settings.tsx).
  const pds = vacancy.postDemoSettings ?? {}
  const anketaThresholds: CandidateSpec["anketaThresholds"] = {
    enabled:        true,   // legacy не имел тумблера — скрининг анкеты всегда активен
    upperThreshold: Math.max(0, Math.min(100, num(pds.upperThreshold, 75))),
    lowerThreshold: Math.max(0, Math.min(100, num(pds.lowerThreshold, 50))),
  }

  // ── (d) Профиль / текстовые описания ─────────────────────────────────────
  // Идеальный профиль: requirementsJson.ideal_profile (v2) > anketa.aiIdealProfile (v1)
  const v2Profile = str(req.ideal_profile)
  const v1Profile = str(anketa.aiIdealProfile)
  const idealProfile = v2Profile || v1Profile

  // «Портрет кандидата» v1 — поля из anketa
  const portraitRequiredSkills = strArr(anketa.aiRequiredHardSkills)
  const portraitNiceSkills     = strArr(anketa.desiredSkills)
  const portraitKnockouts      = strArr(anketa.aiStopFactors)

  const outboundSoftCriteria = str(vacancy.outboundSoftCriteria)

  return {
    // (a) оценочные критерии
    mustHave,
    niceToHave,
    dealBreakers,
    scoringWeights,
    customCriteria,
    // (b) стоп-факторы
    stopFactors,
    // (c) пороги (Этап 2: две пары)
    resumeThresholds,
    anketaThresholds,
    anketaPassInvite: { enabled: false, passThreshold: 35, aiEvalThreshold: 45, contentBlockId: null, messageText: "", delaySeconds: 900, advanceToStage: null, hhAction: null },
    // (d) профиль
    idealProfile,
    portraitRequiredSkills,
    portraitNiceSkills,
    portraitKnockouts,
    outboundSoftCriteria,
    // (e) тексты кандидату (Портрет). inviteLetter подтягиваем из legacy
    // inviteMessage, чтобы существующий текст приглашения сразу был виден в
    // Портрете. rejectLetter/botClarify — нейтральные дефолты (как и раньше).
    rejectLetter: "",
    inviteLetter: typeof (ai as Record<string, unknown>).inviteMessage === "string"
      ? ((ai as Record<string, unknown>).inviteMessage as string)
      : "",
    offHoursLetter: "",   // реальное значение подтянет GET-бэкфилл из vacancy-колонки
    botClarifyAmbiguous: false,
    // метаданные
    // weightMode: legacy всегда использует строковые уровни весов (WeightLevel),
    // поэтому "level" — нейтральный дефолт этапа 2.
    weightMode: "level",
    // scoringMode: legacy-мост всегда даёт холистический скоринг (осевой —
    // только явным переключателем в редакторе Портрета).
    scoringMode: "holistic",
    version: 1,
  }
}
