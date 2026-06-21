/**
 * lib/core/spec/types.ts
 *
 * R4 «Candidate Spec» — единый реестр «кого ищем» для вакансии.
 *
 * СТАТУС: БОЕВОЙ КОНТУР. Spec читается рантаймом скоринга резюме —
 * lib/hh/process-queue.ts (живая очередь hh), rescore- и rediscovery-роуты —
 * через getSpec()+buildSpecResumeInput() (гейт SPEC_SCORING_LEGACY_VACANCY_IDS,
 * по умолчанию Spec включён для всех вакансий с заполненным «Кого ищем»).
 * НЕ подключён к чат-боту. Запись/зеркалирование в legacy — за флагом
 * SPEC_MIRROR_TO_LEGACY (по умолчанию OFF, см. to-legacy.ts и API-роут PUT).
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
  /** Вес критерия (legacy-шкала). Этап 2 заменит на importance (0-100). */
  weight: WeightLevelSchema,
  /** Подсказка AI: что именно проверять в резюме/анкете */
  hint:   z.string().max(300).optional(),
  /**
   * Этап 2 («Портрет»): жёсткость критерия.
   * hard = нокаут при несоответствии, soft = только влияет на балл.
   * Опц. с дефолтом — старые сохранённые критерии читаются как soft.
   */
  hardness: z.enum(["hard", "soft"]).default("soft"),
  /**
   * Этап 2: важность критерия 0-100 (новая непрерывная шкала «Портрета»
   * вместо строковых уровней weight). Опц. с дефолтом 50.
   */
  importance: z.number().int().min(0).max(100).default(50),
  /**
   * Этап 2: как критерий подаётся AI.
   * instruction = жёсткая инструкция, context = справочный контекст,
   * hidden = не передаётся AI (только для UI/ручной оценки).
   * Опц. с дефолтом context.
   */
  aiMode: z.enum(["instruction", "context", "hidden"]).default("context"),
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
  /** Включён ли блок оценки резюме. Выкл — скоринг резюме не применяется
   *  (HR может отключить, чтобы не пользоваться). По умолчанию ВКЛ. */
  enabled:           z.boolean().default(true),
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
  /** Включён ли блок оценки анкеты. Выкл — скрининг ответов не применяется. ВКЛ по умолчанию. */
  enabled:        z.boolean().default(true),
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
 * Каждая ось в [0, 100].
 *
 * Этап 2 («Портрет»): жёсткое требование Σ=100 СНЯТО. Движок
 * (computeWeightedScore в lib/scoring) нормирует баллы на ФАКТИЧЕСКУЮ сумму
 * весов, поэтому любая валидная сумма не ломает скоринг. Σ=100 теперь
 * не более чем удобный ориентир для HR, а не инвариант хранения.
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
})
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

// ─── Must-have пункт (этап 2: hard/soft) ─────────────────────────────────────

/**
 * Один must-have пункт нового формата «Портрета».
 * Этап 2 добавляет признак hard: hard=true → нокаут при несоответствии,
 * hard=false → пункт лишь влияет на балл (soft).
 *
 * ОБРАТНАЯ СОВМЕСТИМОСТЬ: старые Spec хранили mustHave как массив строк.
 * Поэтому CandidateSpec.mustHave принимает union(string | MustHaveItem).
 * Реальный hard/soft-нокаут включится на этапе 2 — сейчас рантайм трактует
 * все пункты одинаково (как и раньше). При чтении строку нормализуем
 * в { text, hard: true } через normalizeMustHave().
 */
export const MustHaveItemSchema = z.object({
  text: z.string().min(1).max(200),
  hard: z.boolean().default(true),
})
export type MustHaveItem = z.infer<typeof MustHaveItemSchema>

/** Тип элемента mustHave: строка (legacy) ИЛИ объект (этап 2). */
export type MustHaveEntry = string | MustHaveItem

/** Текст одного must-have пункта независимо от формата (string|{text}). */
export function mustHaveText(entry: MustHaveEntry): string {
  return typeof entry === "string" ? entry : entry.text
}

/**
 * Нормализует mustHave любого формата в массив { text, hard }.
 * Строка → { text, hard: true } (поведение прежнее: пока все пункты hard-нейтральны).
 * Пустые/битые пункты отбрасываются.
 */
export function normalizeMustHave(items: ReadonlyArray<MustHaveEntry> | null | undefined): MustHaveItem[] {
  if (!Array.isArray(items)) return []
  const out: MustHaveItem[] = []
  for (const it of items) {
    if (typeof it === "string") {
      const t = it.trim()
      if (t) out.push({ text: t, hard: true })
    } else if (it && typeof it === "object" && typeof it.text === "string") {
      const t = it.text.trim()
      if (t) out.push({ text: t, hard: typeof it.hard === "boolean" ? it.hard : true })
    }
  }
  return out
}

/**
 * Возвращает только тексты must-have пунктов (для legacy-потребителей,
 * ожидающих string[]: resume-input, rediscovery, dual-write to-legacy).
 */
export function mustHaveTexts(items: ReadonlyArray<MustHaveEntry> | null | undefined): string[] {
  return normalizeMustHave(items).map(i => i.text)
}

// ─── 🟢 «Подходит»: важность на пункте (nice-to-have, перестройка 21.06) ───────

/**
 * Уровень важности пункта «Подходит» (что поднимает балл, не отсекает).
 * nice = желательно, important = важно, very = очень важно.
 * Верхний уровень «Обязательно (отсекает)» хранится НЕ здесь, а в mustHave
 * (hard:true) — отсев это уже не «балл», а нокаут.
 */
export const NiceImportanceSchema = z.enum(["nice", "important", "very"])
export type NiceImportance = z.infer<typeof NiceImportanceSchema>

export const NiceToHaveItemSchema = z.object({
  text:       z.string().min(1).max(200),
  importance: NiceImportanceSchema.default("nice"),
})
export type NiceToHaveItem = z.infer<typeof NiceToHaveItemSchema>

/** Элемент niceToHave: строка (legacy) ИЛИ объект (важность на пункте). */
export type NiceToHaveEntry = string | NiceToHaveItem

/**
 * Нормализует niceToHave любого формата в массив { text, importance }.
 * Строка → { text, importance: "nice" } (поведение прежнее). Битые отброшены.
 */
export function normalizeNiceToHave(items: ReadonlyArray<NiceToHaveEntry> | null | undefined): NiceToHaveItem[] {
  if (!Array.isArray(items)) return []
  const out: NiceToHaveItem[] = []
  for (const it of items) {
    if (typeof it === "string") {
      const t = it.trim()
      if (t) out.push({ text: t, importance: "nice" })
    } else if (it && typeof it === "object" && typeof it.text === "string") {
      const t = it.text.trim()
      const imp = it.importance === "important" || it.importance === "very" ? it.importance : "nice"
      if (t) out.push({ text: t, importance: imp })
    }
  }
  return out
}

/** Только тексты niceToHave (для legacy-потребителей, ожидающих string[]). */
export function niceToHaveTexts(items: ReadonlyArray<NiceToHaveEntry> | null | undefined): string[] {
  return normalizeNiceToHave(items).map(i => i.text)
}

// ─── 🔴 «Не подходит» / По смыслу: стоп-фактор vs минус к баллу ────────────────

/**
 * Один пункт «Не подходит по смыслу».
 * hard=true  → Стоп-фактор: отказ, если AI прямо видит это в резюме.
 * hard=false → Минус к баллу: снижает балл, но НЕ отказ.
 *
 * ОБРАТНАЯ СОВМЕСТИМОСТЬ: старые Spec хранили dealBreakers как массив строк
 * (все = отказ). Поэтому union(string | DealBreakerItem); строка нормализуется
 * в { text, hard: true } — поведение прежнее.
 */
export const DealBreakerItemSchema = z.object({
  text: z.string().min(1).max(200),
  hard: z.boolean().default(true),
})
export type DealBreakerItem = z.infer<typeof DealBreakerItemSchema>

/** Элемент dealBreakers: строка (legacy) ИЛИ объект (стоп/минус). */
export type DealBreakerEntry = string | DealBreakerItem

/**
 * Нормализует dealBreakers любого формата в массив { text, hard }.
 * Строка → { text, hard: true } (отказ, как раньше). Битые отброшены.
 */
export function normalizeDealBreakers(items: ReadonlyArray<DealBreakerEntry> | null | undefined): DealBreakerItem[] {
  if (!Array.isArray(items)) return []
  const out: DealBreakerItem[] = []
  for (const it of items) {
    if (typeof it === "string") {
      const t = it.trim()
      if (t) out.push({ text: t, hard: true })
    } else if (it && typeof it === "object" && typeof it.text === "string") {
      const t = it.text.trim()
      if (t) out.push({ text: t, hard: typeof it.hard === "boolean" ? it.hard : true })
    }
  }
  return out
}

/** Только тексты dealBreakers (для legacy-потребителей, ожидающих string[]). */
export function dealBreakerTexts(items: ReadonlyArray<DealBreakerEntry> | null | undefined): string[] {
  return normalizeDealBreakers(items).map(i => i.text)
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
   * Must-have критерии (до 10). Если >=1 — включает v2-скоринг.
   * Соответствует requirementsJson.must_have.
   *
   * Формат элемента: строка (legacy, старые сохранённые Spec) ИЛИ объект
   * { text, hard } (этап 2 «Портрет», hard/soft). Union обеспечивает
   * обратную совместимость; для legacy-потребителей нормализуйте через
   * mustHaveTexts()/normalizeMustHave().
   */
  mustHave:      z.array(z.union([z.string().min(1).max(200), MustHaveItemSchema])).max(10).default([]),
  /**
   * 🟢 «Подходит» — пункты, что повышают балл, но не дисквалифицируют (до 10).
   * Формат: строка (legacy) ИЛИ { text, importance } (важность на пункте,
   * перестройка 21.06). Нормализуйте через niceToHaveTexts()/normalizeNiceToHave().
   * Соответствует requirementsJson.nice_to_have.
   */
  niceToHave:    z.array(z.union([z.string().min(1).max(200), NiceToHaveItemSchema])).max(10).default([]),
  /**
   * 🔴 «Не подходит по смыслу» — дисквалификаторы (до 10).
   * Формат: строка (legacy = всегда стоп-фактор) ИЛИ { text, hard }
   * (hard=true → Стоп-фактор/отказ, hard=false → Минус к баллу).
   * Нормализуйте через dealBreakerTexts()/normalizeDealBreakers().
   * Соответствует requirementsJson.deal_breakers.
   */
  dealBreakers:  z.array(z.union([z.string().min(1).max(200), DealBreakerItemSchema])).max(10).default([]),
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

  /**
   * 🤖 Спорное уточняет бот: если AI не на 100% уверен (по dealBreakers/критериям) —
   * не резать сразу, а дать боту в чате уточнить у кандидата. Хранится сейчас как
   * настройка; интеграция с чат-ботом — отдельным шагом. По умолчанию ВЫКЛ.
   */
  botClarifyAmbiguous: z.boolean().default(false),

  // ── Метаданные ────────────────────────────────────────────────────────────
  /**
   * Этап 2 («Портрет»): режим задания весов критериев.
   * level   — строковые уровни (legacy WeightLevel, critical/important/...).
   * percent — непрерывная важность 0-100 (новая шкала «Портрета»).
   * Опц. с дефолтом level — поведение прежнее, пока этап-2 UI не активирован.
   */
  weightMode:    z.enum(["level", "percent"]).default("level"),
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
