/**
 * lib/core/spec/types.ts
 *
 * R4 «Candidate Spec» — единый реестр «кого ищем» для вакансии.
 *
 * СТАТУС: СПЯЩИЙ КОД. Новый контур, не подключён к рантайму скоринга и чат-бота.
 * Активация — через флаг useNewCore на вакансии-полигоне.
 *
 * Зависит только от zod (уже в проекте). Никаких серверных/DB-импортов.
 */

import { z } from "zod"

// ─── Оценочные критерии ──────────────────────────────────────────────────────

/**
 * Вес критерия оценки — аналог WeightLevel из lib/scoring/types.ts,
 * но в Spec хранится числом (0-3), чтобы не зависеть от строковых enum'ов
 * и легко суммировать. Обратный маппинг: 3=critical, 2=important, 1=nice, 0=irrelevant.
 */
export const weightLevelValues = { critical: 3, important: 2, nice: 1, irrelevant: 0 } as const
export type WeightLevel = keyof typeof weightLevelValues

export const WeightLevelSchema = z.enum(["critical", "important", "nice", "irrelevant"])

/**
 * Критерий оценки — один из N осей, по которым AI оценивает резюме/анкету.
 * Встроенные оси (5 штук из scoring/vacancy-spec.ts) + кастомные HR добавляет сам.
 */
export const CriterionSchema = z.object({
  /** snake_case-ключ, уникален внутри spec.criteria */
  key:    z.string().min(1).max(80),
  /** Отображаемое имя критерия */
  label:  z.string().min(1).max(120),
  /** Вес критерия */
  weight: WeightLevelSchema,
  /** Подсказка AI: что именно проверять в резюме/анкете */
  hint:   z.string().max(300).optional(),
})
export type Criterion = z.infer<typeof CriterionSchema>

// ─── Пороги и маршрутизация ──────────────────────────────────────────────────

/**
 * Что делать с кандидатом в диапазоне lowerThreshold ≤ score < upperThreshold.
 * - direct_demo      — сразу на демо (дефолт для большинства вакансий)
 * - prequalification — AI-вопросы предквалификации, затем демо/отказ
 * - keep_new         — оставить на ручной разбор HR
 */
export const MidRangeActionSchema = z.enum(["direct_demo", "prequalification", "keep_new"])
export type MidRangeAction = z.infer<typeof MidRangeActionSchema>

/**
 * Этап 2 (T1 закрыт): ДВЕ пары порогов вместо одной.
 *
 * Решение координатора: пороги резюме и пороги анкеты — разные смыслы,
 * объединение в одну шкалу меняло бы поведение анкеты при активации
 * (резюме lower=40 vs анкета lower=50). Spec хранит обе пары раздельно:
 *   - resumeThresholds — оценка резюме (legacy: aiProcessSettings, дефолты 75/40)
 *   - anketaThresholds — оценка анкеты (legacy: demos.postDemoSettings, дефолты 75/50)
 */

/** Пороги ОЦЕНКИ РЕЗЮМЕ + маршрутизация. Legacy-источник: vacancies.ai_process_settings. */
export const ResumeThresholdsSchema = z.object({
  /** Верхний порог: score >= upper → invite */
  upperThreshold:    z.number().int().min(0).max(100).default(75),
  /** Нижний порог: score < lower → reject/keep_new */
  lowerThreshold:    z.number().int().min(0).max(100).default(40),
  /** Действие для диапазона [lower, upper) */
  midRangeAction:    MidRangeActionSchema.default("direct_demo"),
  /**
   * Реальный авто-отказ при score < lower (отправляет discard через hh).
   * По умолчанию ВЫКЛ — кандидаты идут в keep_new (ручной разбор).
   */
  autoRejectEnabled: z.boolean().default(false),
  /**
   * Задержка отказа в минутах. 0 = мгновенно.
   * Дефолт 300 (5 ч) — утренний отклик → отказ к обеду.
   */
  rejectionDelayMinutes: z.number().int().min(0).default(300),
})
export type ResumeThresholds = z.infer<typeof ResumeThresholdsSchema>

/**
 * Пороги ОЦЕНКИ АНКЕТЫ (после демо). Legacy-источник: demos.post_demo_settings
 * (запись kind='demo', ключи upperThreshold/lowerThreshold; UI — PostDemoSettings,
 * секция «thresholds» блока «AI-скрининг анкеты»).
 * Маршрутизация анкеты (зелёный/жёлтый/красный экраны) остаётся в legacy —
 * в Spec только сами пороги.
 */
export const AnketaThresholdsSchema = z.object({
  /** Верхний порог: score >= upper → зелёный уровень (приглашение на встречу) */
  upperThreshold: z.number().int().min(0).max(100).default(75),
  /** Нижний порог: score < lower → красный уровень */
  lowerThreshold: z.number().int().min(0).max(100).default(50),
})
export type AnketaThresholds = z.infer<typeof AnketaThresholdsSchema>

// ─── Стоп-факторы ───────────────────────────────────────────────────────────

/**
 * Жёсткий стоп-фактор: если триггерится → авто-отказ ДО скоринга.
 * Хранятся как подтипы с enabled-флагом, чтобы HR мог включить/отключить
 * без потери настроек.
 *
 * Перечень полностью соответствует VacancyStopFactors в schema.ts.
 */
export const StopFactorCitySchema = z.object({
  enabled:          z.boolean().default(false),
  allowedCities:    z.array(z.string()).optional(),
  allowRelocation:  z.boolean().optional(),
  rejectionText:    z.string().optional(),
})

export const StopFactorFormatSchema = z.object({
  enabled:        z.boolean().default(false),
  allowedFormats: z.array(z.enum(["office", "hybrid", "remote"])).optional(),
  rejectionText:  z.string().optional(),
})

export const StopFactorAgeSchema = z.object({
  enabled:       z.boolean().default(false),
  minAge:        z.number().int().min(14).max(100).optional(),
  maxAge:        z.number().int().min(14).max(100).optional(),
  rejectionText: z.string().optional(),
})

export const StopFactorExperienceSchema = z.object({
  enabled:       z.boolean().default(false),
  minYears:      z.number().min(0).max(50).optional(),
  rejectionText: z.string().optional(),
})

export const StopFactorDocumentsSchema = z.object({
  enabled:       z.boolean().default(false),
  required:      z.array(z.string()).optional(),
  rejectionText: z.string().optional(),
})

export const StopFactorCitizenshipSchema = z.object({
  enabled:       z.boolean().default(false),
  allowed:       z.array(z.string()).optional(),
  rejectionText: z.string().optional(),
})

export const StopFactorSalarySchema = z.object({
  enabled:       z.boolean().default(false),
  maxAmount:     z.number().int().min(0).optional(),
  rejectionText: z.string().optional(),
})

export const StopFactorsSchema = z.object({
  city:               StopFactorCitySchema.optional(),
  format:             StopFactorFormatSchema.optional(),
  age:                StopFactorAgeSchema.optional(),
  experience:         StopFactorExperienceSchema.optional(),
  documents:          StopFactorDocumentsSchema.optional(),
  citizenship:        StopFactorCitizenshipSchema.optional(),
  salaryExpectation:  StopFactorSalarySchema.optional(),
})
export type StopFactors = z.infer<typeof StopFactorsSchema>

// ─── Оценочные критерии (v2 и портрет) ──────────────────────────────────────

/**
 * Веса девяти фиксированных осей v2-скоринга.
 * Полностью соответствует ScoringWeights в schema.ts.
 * Сумма = 100, каждый в [0, 100].
 */
export const ScoringWeightsSchema = z.object({
  relevant_experience: z.number().int().min(0).max(100),
  hard_skills:         z.number().int().min(0).max(100),
  tenure_stability:    z.number().int().min(0).max(100),
  results_in_numbers:  z.number().int().min(0).max(100),
  soft_skills_fit:     z.number().int().min(0).max(100),
  company_size_match:  z.number().int().min(0).max(100),
  managerial_match:    z.number().int().min(0).max(100),
  education:           z.number().int().min(0).max(100),
  location_readiness:  z.number().int().min(0).max(100),
}).refine(
  (w) => Object.values(w).reduce((s, v) => s + v, 0) === 100,
  { message: "Сумма scoring_weights должна равняться 100" },
)
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  relevant_experience: 30,
  hard_skills:         25,
  tenure_stability:    10,
  results_in_numbers:  10,
  soft_skills_fit:     10,
  company_size_match:  5,
  managerial_match:    5,
  education:           3,
  location_readiness:  2,
}

// ─── Главная модель CandidateSpec ────────────────────────────────────────────

/**
 * CandidateSpec — единый источник «кого ищем» для одной вакансии.
 *
 * Четыре секции:
 *   (a) criteria   — оценочные критерии (v2-must/nice/dealbreaker + произвольные HR-оси)
 *   (b) stopFactors — жёсткий предварительный отсев (город/формат/возраст/…)
 *   (c) thresholds — ДВЕ пары порогов: resumeThresholds (резюме, 75/40 + маршрутизация)
 *       и anketaThresholds (анкета, 75/50). Этап 2, решение T1.
 *   (d) profile     — идеальный профиль, текстовые описания для AI
 */
export const CandidateSpecSchema = z.object({
  // ── (a) Оценочные критерии ───────────────────────────────────────────────
  /**
   * Must-have критерии (3-5 штук). Если >=1 — включает v2-скоринг.
   * Соответствует requirementsJson.must_have.
   */
  mustHave:      z.array(z.string().min(1).max(200)).max(5).default([]),
  /**
   * Желательные критерии (до 5 штук). Повышают скор, но не дисквалифицируют.
   * Соответствует requirementsJson.nice_to_have.
   */
  niceToHave:    z.array(z.string().min(1).max(200)).max(5).default([]),
  /**
   * Дисквалификаторы (до 3). Presence → reject, даже если скор высокий.
   * Соответствует requirementsJson.deal_breakers.
   */
  dealBreakers:  z.array(z.string().min(1).max(200)).max(3).default([]),
  /**
   * Взвешенные критерии для v2-скоринга (9 осей Σ=100).
   * Соответствует requirementsJson.scoring_weights.
   */
  scoringWeights: ScoringWeightsSchema.default(DEFAULT_SCORING_WEIGHTS),
  /**
   * Произвольные оси оценки, добавленные HR (из anketa.aiCustomCriteria).
   * Сверх девяти фиксированных осей v2.
   */
  customCriteria: z.array(CriterionSchema).default([]),

  // ── (b) Стоп-факторы ─────────────────────────────────────────────────────
  /**
   * Жёсткие стоп-факторы. Проверяются ДО скоринга.
   * Полная копия vacancy.stopFactorsJson.
   */
  stopFactors:   StopFactorsSchema.default({}),

  // ── (c) Пороги и маршрутизация (Этап 2: две пары) ────────────────────────
  /** Пороги оценки резюме + маршрутизация mid-range. Дефолты 75/40. */
  resumeThresholds: ResumeThresholdsSchema.default({}),
  /** Пороги оценки анкеты (после демо). Дефолты 75/50. */
  anketaThresholds: AnketaThresholdsSchema.default({}),

  // ── (d) Профиль / текстовые описания ─────────────────────────────────────
  /**
   * Идеальный профиль в свободной форме (1-2 предложения для AI).
   * Объединяет: requirementsJson.ideal_profile (v2) + anketa.aiIdealProfile (портрет v1).
   * При конфликте приоритет у requirementsJson.ideal_profile (актуальнее).
   */
  idealProfile:  z.string().max(500).default(""),
  /**
   * Жёсткие навыки из «Портрета кандидата» (anketa.aiRequiredHardSkills).
   * В Spec берётся как fallback для mustHave, если v2-поля не заполнены.
   * Хранится отдельно, чтобы мост from-legacy мог отличать источники.
   */
  portraitRequiredSkills:  z.array(z.string()).default([]),
  /**
   * Желательные навыки из «Портрета» (anketa.desiredSkills → требуются в v1,
   * в Spec = niceToHave если v2-nice_to_have пуст).
   */
  portraitNiceSkills:      z.array(z.string()).default([]),
  /**
   * Текстовые стоп-факторы из «Портрета» (anketa.aiStopFactors).
   * Дополняют структурированные stopFactors (textual knockout для AI).
   */
  portraitKnockouts:       z.array(z.string()).default([]),
  /**
   * «Мягкие критерии» из outbound-кампании (outboundSearches.softCriteria).
   * Передаётся в AI как дополнительный контекст при outbound-скоринге.
   */
  outboundSoftCriteria:    z.string().max(1000).default(""),

  // ── Метаданные ────────────────────────────────────────────────────────────
  /** Версия Spec — для будущих миграций формата */
  version:       z.literal(1).default(1),
  /** Отметка времени последнего изменения Spec через новый контур */
  updatedAt:     z.string().datetime().optional(),
})

export type CandidateSpec = z.infer<typeof CandidateSpecSchema>

/**
 * Ответ API GET /api/core/spec/[vacancyId].
 * source: "spec"   — данные из vacancy_specs (новый контур)
 *         "legacy" — данные собраны из legacy-полей через buildSpecFromLegacy
 */
export interface SpecApiResponse {
  spec:   CandidateSpec
  source: "spec" | "legacy"
}
