/**
 * scripts/check-spec-from-legacy.ts
 *
 * Юнит-тест buildSpecFromLegacy (node:test, tsx --test).
 * Запуск: npx tsx --test scripts/check-spec-from-legacy.ts
 *
 * Кейсы:
 *   1. Пустая вакансия (все поля null/undefined) → дефолты
 *   2. Только v1-поля (aiProcessSettings.minScore, anketa-портрет)
 *   3. Только v2-поля (requirementsJson, aiProcessSettings с новыми ключами)
 *   4. Все вместе (v1 + v2 + stopFactors) → v2 имеет приоритет
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { buildSpecFromLegacy } from "@/lib/core/spec/from-legacy"
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/core/spec/types"

// ─── Кейс 1: пустая вакансия ─────────────────────────────────────────────────
test("Кейс 1: пустая вакансия → дефолты", () => {
  const spec = buildSpecFromLegacy({})

  assert.deepEqual(spec.mustHave,     [], "mustHave должен быть пустым")
  assert.deepEqual(spec.niceToHave,   [], "niceToHave должен быть пустым")
  assert.deepEqual(spec.dealBreakers, [], "dealBreakers должен быть пустым")
  assert.deepEqual(spec.scoringWeights, DEFAULT_SCORING_WEIGHTS, "scoringWeights = дефолт")

  assert.equal(spec.thresholds.upperThreshold,     75,            "upper = 75")
  assert.equal(spec.thresholds.lowerThreshold,     40,            "lower = 40")
  assert.equal(spec.thresholds.midRangeAction,     "direct_demo", "midRange = direct_demo")
  assert.equal(spec.thresholds.autoRejectEnabled,  false,         "autoReject = false")
  assert.equal(spec.thresholds.rejectionDelayMinutes, 300,        "rejDelay = 300")

  assert.equal(spec.idealProfile,          "", "idealProfile пустой")
  assert.deepEqual(spec.portraitRequiredSkills, [], "portraitRequired пустой")
  assert.deepEqual(spec.stopFactors,       {},  "stopFactors пустой объект")
  assert.equal(spec.version,               1,   "version = 1")
})

// ─── Кейс 2: только v1-поля ──────────────────────────────────────────────────
test("Кейс 2: только v1-поля (minScore, anketa-портрет)", () => {
  const spec = buildSpecFromLegacy({
    aiProcessSettings: {
      minScore:          55,          // legacy alias → minScoreLower
      midRangeAction:    "keep_new",
      autoRejectEnabled: true,
      rejectionDelayMinutes: 120,
    },
    descriptionJson: {
      anketa: {
        aiIdealProfile:       "Опытный менеджер B2B",
        aiRequiredHardSkills: ["CRM", "Excel"],
        desiredSkills:        ["PowerBI"],
        aiStopFactors:        ["нет опыта продаж"],
      },
    },
  })

  // v2 не заполнен → пустые must/nice/deal
  assert.deepEqual(spec.mustHave, [])
  assert.deepEqual(spec.niceToHave, [])
  assert.deepEqual(spec.dealBreakers, [])

  // пороги из v1
  assert.equal(spec.thresholds.upperThreshold,       75)    // нет aiProcessSettings.minScoreUpper → дефолт
  assert.equal(spec.thresholds.lowerThreshold,       55)    // minScore → lower
  assert.equal(spec.thresholds.midRangeAction,       "keep_new")
  assert.equal(spec.thresholds.autoRejectEnabled,    true)
  assert.equal(spec.thresholds.rejectionDelayMinutes, 120)

  // портрет
  assert.equal(spec.idealProfile,                     "Опытный менеджер B2B")
  assert.deepEqual(spec.portraitRequiredSkills,       ["CRM", "Excel"])
  assert.deepEqual(spec.portraitNiceSkills,           ["PowerBI"])
  assert.deepEqual(spec.portraitKnockouts,            ["нет опыта продаж"])
})

// ─── Кейс 3: только v2-поля ──────────────────────────────────────────────────
test("Кейс 3: только v2-поля (requirementsJson, новые ключи aiProcessSettings)", () => {
  const weights = {
    relevant_experience: 40,
    hard_skills:         30,
    tenure_stability:    5,
    results_in_numbers:  5,
    soft_skills_fit:     5,
    company_size_match:  5,
    managerial_match:    5,
    education:           3,
    location_readiness:  2,
  }

  const spec = buildSpecFromLegacy({
    requirementsJson: {
      must_have:       ["опыт B2B", "английский B2"],
      nice_to_have:    ["опыт в SaaS"],
      deal_breakers:   ["нет опыта продаж"],
      ideal_profile:   "Опытный сейлз с B2B-бэкграундом",
      scoring_weights: weights,
    },
    aiProcessSettings: {
      minScoreUpper:         80,
      minScoreLower:         50,
      midRangeAction:        "prequalification",
      autoRejectEnabled:     false,
      rejectionDelayMinutes: 240,
    },
  })

  assert.deepEqual(spec.mustHave,     ["опыт B2B", "английский B2"])
  assert.deepEqual(spec.niceToHave,   ["опыт в SaaS"])
  assert.deepEqual(spec.dealBreakers, ["нет опыта продаж"])
  assert.deepEqual(spec.scoringWeights, weights)
  assert.equal(spec.idealProfile,     "Опытный сейлз с B2B-бэкграундом")

  assert.equal(spec.thresholds.upperThreshold,       80)
  assert.equal(spec.thresholds.lowerThreshold,       50)
  assert.equal(spec.thresholds.midRangeAction,       "prequalification")
  assert.equal(spec.thresholds.autoRejectEnabled,    false)
  assert.equal(spec.thresholds.rejectionDelayMinutes, 240)

  // anketa не передана → пустые
  assert.deepEqual(spec.portraitRequiredSkills, [])
  assert.deepEqual(spec.portraitKnockouts,      [])
})

// ─── Кейс 4: всё вместе (v1 + v2 + stopFactors) ─────────────────────────────
test("Кейс 4: v1 + v2 + stopFactors → v2 имеет приоритет", () => {
  const spec = buildSpecFromLegacy({
    requirementsJson: {
      must_have:     ["опыт B2B"],
      ideal_profile: "v2-профиль",
    },
    aiProcessSettings: {
      minScore:    30,          // legacy v1
      minScoreLower: 45,        // v2 — должен победить
      minScoreUpper: 80,
    },
    descriptionJson: {
      anketa: {
        aiIdealProfile:       "v1-профиль",   // должен быть перекрыт v2
        aiRequiredHardSkills: ["Excel"],
      },
    },
    stopFactorsJson: {
      city: {
        enabled:       true,
        allowedCities: ["Москва", "Санкт-Петербург"],
        allowRelocation: false,
      },
      age: {
        enabled: true,
        minAge:  21,
        maxAge:  45,
      },
    },
  })

  // v2 must_have
  assert.deepEqual(spec.mustHave, ["опыт B2B"])

  // v2-профиль приоритет
  assert.equal(spec.idealProfile, "v2-профиль", "v2 ideal_profile должен перекрыть v1")

  // v2 lower (minScoreLower=45 > minScore=30 → берём minScoreLower)
  assert.equal(spec.thresholds.lowerThreshold, 45, "minScoreLower должен перекрыть minScore")
  assert.equal(spec.thresholds.upperThreshold, 80)

  // портрет сохраняется независимо
  assert.deepEqual(spec.portraitRequiredSkills, ["Excel"])

  // стоп-факторы
  assert.equal(spec.stopFactors.city?.enabled,            true)
  assert.deepEqual(spec.stopFactors.city?.allowedCities,  ["Москва", "Санкт-Петербург"])
  assert.equal(spec.stopFactors.city?.allowRelocation,    false)
  assert.equal(spec.stopFactors.age?.enabled,             true)
  assert.equal(spec.stopFactors.age?.minAge,              21)
  assert.equal(spec.stopFactors.age?.maxAge,              45)
  assert.equal(spec.stopFactors.format,                   undefined, "format не задан")
})

// ─── Кейс 5: невалидные данные не ломают функцию ─────────────────────────────
test("Кейс 5: мусорные данные → дефолты без исключений", () => {
  const spec = buildSpecFromLegacy({
    requirementsJson: {
      must_have:       null as unknown as string[],  // тип нарушен
      scoring_weights: { invalid: true } as unknown as import("@/lib/db/schema").ScoringWeights,
    },
    aiProcessSettings: {
      minScoreUpper: NaN,   // невалидное число
      minScoreLower: -10,   // отрицательное → ограничивается до 0
    } as unknown as import("@/lib/db/schema").VacancyAiProcessSettings,
  })

  // null-массив → пустой массив
  assert.deepEqual(spec.mustHave, [])

  // невалидные weights → DEFAULT
  assert.deepEqual(spec.scoringWeights, DEFAULT_SCORING_WEIGHTS)

  // NaN upper → дефолт 75
  assert.equal(spec.thresholds.upperThreshold, 75)

  // -10 lower → ограничен до 0
  assert.equal(spec.thresholds.lowerThreshold, 0)
})

// ─── Кейс 6: outboundSoftCriteria ────────────────────────────────────────────
test("Кейс 6: outboundSoftCriteria пробрасывается", () => {
  const spec = buildSpecFromLegacy({
    outboundSoftCriteria: "  Опыт в edtech, B2B-продажи  ",
  })

  assert.equal(spec.outboundSoftCriteria, "Опыт в edtech, B2B-продажи",
    "Строка должна быть trim()")
})
