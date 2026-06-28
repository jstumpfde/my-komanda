/**
 * lib/core/spec/to-legacy.ts
 *
 * Мост: ЗАПИСЬ (зеркалирование) CandidateSpec обратно в legacy-поля вакансии.
 * Обратное преобразование к from-legacy.ts. Чистая функция без серверных
 * зависимостей (DB, SDK, fs).
 *
 * НАЗНАЧЕНИЕ: dual-write Spec → legacy ЗА ФЛАГОМ SPEC_MIRROR_TO_LEGACY
 * (по умолчанию OFF — см. /api/core/spec/[vacancyId] PUT). Пока флаг выключен,
 * эта функция НЕ вызывается и боевое поведение скоринга не меняется.
 *
 * ВАЖНО: возвращаются ПАТЧИ (Partial), а НЕ целые объекты — вызывающий
 * делает MERGE поверх текущих legacy-полей, чтобы сохранить смежные настройки
 * (aiProcessSettings.prequalification / inviteMessage / rejectMessage / soft-
 * флаги воронки; requirementsJson.ai_suggested_at и пр.). Так dual-write не
 * затирает ничего, кроме полей, которыми реально владеет Spec.
 *
 * Маппинг Spec → legacy (инверсия from-legacy):
 *
 * | Spec поле                                  | → Legacy patch                              |
 * |--------------------------------------------|---------------------------------------------|
 * | mustHave (текст пунктов)                   | requirementsJson.must_have                  |
 * | niceToHave                                 | requirementsJson.nice_to_have               |
 * | dealBreakers                               | requirementsJson.deal_breakers              |
 * | scoringWeights                             | requirementsJson.scoring_weights            |
 * | idealProfile                               | requirementsJson.ideal_profile              |
 * | resumeThresholds.upperThreshold            | aiProcessSettings.minScoreUpper             |
 * | resumeThresholds.lowerThreshold            | aiProcessSettings.minScoreLower (+ minScore)|
 * | resumeThresholds.midRangeAction            | aiProcessSettings.midRangeAction            |
 * | resumeThresholds.autoRejectEnabled         | aiProcessSettings.autoRejectEnabled         |
 * | resumeThresholds.rejectionDelayMinutes     | aiProcessSettings.rejectionDelayMinutes     |
 * | stopFactors                                | stopFactorsJson (только заданные ключи)     |
 *
 * НЕ зеркалятся обратно (нет legacy-эквивалента / источник иной):
 *   - anketaThresholds  → живут в demos.post_demo_settings (отдельная таблица)
 *   - customCriteria / portrait* / outboundSoftCriteria → descriptionJson.anketa
 *     и outbound_searches; их dual-write здесь не выполняется (этап 2).
 */

import type { CandidateSpec } from "./types"
import { mustHaveTexts, niceToHaveTexts, dealBreakerTexts } from "./types"
import type {
  VacancyRequirements,
  VacancyAiProcessSettings,
  VacancyStopFactors,
} from "@/lib/db/schema"

/** Патчи для merge в legacy-поля вакансии. */
export interface SpecLegacyPatches {
  /** Патч поверх vacancies.requirements_json (MERGE). */
  requirementsJson:  Partial<VacancyRequirements>
  /** Патч поверх vacancies.ai_process_settings (MERGE). */
  aiProcessSettings: Partial<VacancyAiProcessSettings>
  /** Патч поверх vacancies.stop_factors_json (MERGE по ключам стоп-факторов). */
  stopFactorsJson:   Partial<VacancyStopFactors>
}

/**
 * Преобразует CandidateSpec в патчи legacy-полей.
 * Не делает запросов к БД, не бросает исключений.
 */
export function specToLegacy(spec: CandidateSpec): SpecLegacyPatches {
  // ── requirementsJson ───────────────────────────────────────────────────────
  // Все три списка могут быть в union-формате — берём только тексты для legacy
  // (v2-скоринг и compare-requirements читают requirementsJson как string[]).
  const requirementsJson: Partial<VacancyRequirements> = {
    must_have:      mustHaveTexts(spec.mustHave),
    nice_to_have:   niceToHaveTexts(spec.niceToHave),
    deal_breakers:  dealBreakerTexts(spec.dealBreakers),
    scoring_weights: { ...spec.scoringWeights },
    ideal_profile:  spec.idealProfile,
  }

  // ── aiProcessSettings (пороги резюме + маршрутизация) ───────────────────────
  const rt = spec.resumeThresholds
  const aiProcessSettings: Partial<VacancyAiProcessSettings> = {
    minScoreUpper:         rt.upperThreshold,
    minScoreLower:         rt.lowerThreshold,
    // legacy-alias: пишем оба (from-legacy читает minScoreLower ?? minScore).
    minScore:              rt.lowerThreshold,
    midRangeAction:        rt.midRangeAction,
    autoRejectEnabled:     rt.autoRejectEnabled,
    rejectionDelayMinutes: rt.rejectionDelayMinutes,
  }
  // NB: текст приглашения (inviteLetter → inviteMessage + цепочка) зеркалится
  // ВСЕГДА отдельной функцией syncInviteTextToLegacy в spec-роуте, а НЕ здесь —
  // полный specToLegacy mirror за флагом SPEC_MIRROR_TO_LEGACY (по умолч. выкл),
  // а текст приглашения кандидату обязан синкаться независимо от флага.

  // ── stopFactorsJson ─────────────────────────────────────────────────────────
  // Структура Spec.stopFactors идентична VacancyStopFactors. Включаем только
  // заданные ключи, чтобы MERGE не добавлял undefined-ветки.
  const sf = spec.stopFactors
  const stopFactorsJson: Partial<VacancyStopFactors> = {}
  if (sf.city)              stopFactorsJson.city              = { ...sf.city }
  if (sf.format)            stopFactorsJson.format            = { ...sf.format }
  if (sf.age)               stopFactorsJson.age               = { ...sf.age }
  if (sf.experience)        stopFactorsJson.experience        = { ...sf.experience }
  if (sf.documents)         stopFactorsJson.documents         = { ...sf.documents }
  if (sf.citizenship)       stopFactorsJson.citizenship       = { ...sf.citizenship }
  if (sf.salaryExpectation) stopFactorsJson.salaryExpectation = { ...sf.salaryExpectation }

  return { requirementsJson, aiProcessSettings, stopFactorsJson }
}
