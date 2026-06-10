/**
 * lib/core/spec/from-legacy.ts
 *
 * Мост: ЧТЕНИЕ CandidateSpec из legacy-полей вакансии.
 * Чистая функция без серверных зависимостей (DB, SDK, fs).
 *
 * СТАТУС: СПЯЩИЙ КОД. Используется только через /api/core/spec/[vacancyId] (GET).
 * Не вызывается из рантайма скоринга/чат-бота напрямую.
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
 * | aiProcessSettings.minScoreUpper         | thresholds.upperThreshold          | резюме; дефолт 75                         |
 * | aiProcessSettings.minScoreLower         | thresholds.lowerThreshold          | резюме; fallback minScore; дефолт 40      |
 * | aiProcessSettings.midRangeAction        | thresholds.midRangeAction          | резюме; дефолт direct_demo                |
 * | aiProcessSettings.autoRejectEnabled     | thresholds.autoRejectEnabled       |                                           |
 * | aiProcessSettings.rejectionDelayMinutes | thresholds.rejectionDelayMinutes   | дефолт 300                                |
 * | descriptionJson.anketa.upperThreshold   | thresholds.upperThreshold          | анкета (PostDemoSettings); НЕ перезаписыв.|
 * | descriptionJson.anketa.lowerThreshold   | thresholds.lowerThreshold          | СПОРНО: анкета = 50 vs резюме = 40        |
 * | stopFactorsJson                         | stopFactors                        | прямой маппинг                            |
 * | descriptionJson.anketa.aiIdealProfile   | idealProfile (fallback)            | если requirementsJson.ideal_profile пуст  |
 * | descriptionJson.anketa.aiRequiredHardSkills | portraitRequiredSkills         | «Портрет кандидата» v1                    |
 * | descriptionJson.anketa.desiredSkills    | portraitNiceSkills                 | «Портрет кандидата» v1                    |
 * | descriptionJson.anketa.aiStopFactors    | portraitKnockouts                  | текстовые нокауты v1                      |
 * | descriptionJson.anketa.aiCustomCriteria | customCriteria                     | произвольные оси HR                       |
 * | outboundSoftCriteria                    | outboundSoftCriteria               | передаётся явно (из outbound_searches)    |
 *
 * СПОРНЫЕ РЕШЕНИЯ:
 * 1. Пороги анкеты (lowerThreshold=50) vs пороги резюме (lowerThreshold=40).
 *    Решение: берём пороги из aiProcessSettings (резюме-контекст). Пороги анкеты
 *    хранятся отдельно в descriptionJson.anketa.{upper,lower}Threshold, но в Spec
 *    они НЕ заполняют thresholds — это отдельная секция для будущего разделения.
 *    Пока Spec имеет ОДНУ пару порогов: из aiProcessSettings.
 *    TODO: добавить resumeThresholds и anketaThresholds в v2 Spec.
 * 2. Идеальный профиль: если заполнены оба (v2 requirementsJson.ideal_profile и
 *    v1 anketa.aiIdealProfile) — берём requirementsJson (более структурированный).
 * 3. portaitRequiredSkills vs mustHave: НЕ объединяем автоматически, храним оба.
 *    При активации нового скоринга потребителю нужно выбрать источник вручную.
 */

import type { CandidateSpec } from "./types"
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

  const mustHave     = strArr(req.must_have).slice(0, 5)
  const niceToHave   = strArr(req.nice_to_have).slice(0, 5)
  const dealBreakers = strArr(req.deal_breakers).slice(0, 3)

  // scoring_weights: берём из requirementsJson; если невалидны — DEFAULT
  const rawWeights = req.scoring_weights
  let scoringWeights = DEFAULT_SCORING_WEIGHTS
  if (rawWeights && typeof rawWeights === "object") {
    const keys = Object.keys(DEFAULT_SCORING_WEIGHTS) as (keyof typeof DEFAULT_SCORING_WEIGHTS)[]
    const weightsAsAny = rawWeights as unknown as Record<string, unknown>
    const allPresent = keys.every(k => typeof weightsAsAny[k] === "number")
    const sum = allPresent ? keys.reduce((s, k) => s + ((weightsAsAny[k] as number) ?? 0), 0) : 0
    if (allPresent && sum === 100) {
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
      customCriteria.push({
        key:    str(item.key) || `custom_${customCriteria.length}`,
        label,
        weight,
        hint:   str(item.hint) || undefined,
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

  // ── (c) Пороги и маршрутизация ────────────────────────────────────────────
  // Берём ТОЛЬКО из aiProcessSettings (пороги резюме).
  // Пороги анкеты (anketa.upperThreshold/lowerThreshold из PostDemoSettings) —
  // намеренно НЕ записываются в thresholds. Они хранятся в descriptionJson.anketa
  // и пока остаются legacy-only (см. СПОРНЫЕ РЕШЕНИЯ выше).
  const upper      = num(ai.minScoreUpper, 75)
  const lower      = num(ai.minScoreLower ?? (ai as Record<string, unknown>).minScore, 40)
  const midRange   = validMidRange(ai.midRangeAction ?? (ai as Record<string, unknown>).belowThresholdAction)
  const autoReject = bool(ai.autoRejectEnabled, false)
  const rejDelay   = num(ai.rejectionDelayMinutes, 300)

  const thresholds: CandidateSpec["thresholds"] = {
    upperThreshold:       Math.max(0, Math.min(100, upper)),
    lowerThreshold:       Math.max(0, Math.min(100, lower)),
    midRangeAction:       midRange,
    autoRejectEnabled:    autoReject,
    rejectionDelayMinutes: Math.max(0, rejDelay),
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
    // (c) пороги
    thresholds,
    // (d) профиль
    idealProfile,
    portraitRequiredSkills,
    portraitNiceSkills,
    portraitKnockouts,
    outboundSoftCriteria,
    // метаданные
    version: 1,
  }
}
