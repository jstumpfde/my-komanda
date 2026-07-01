// Юнит-тесты авто-гейта по баллу воронки v2 (Фаза 1в).
// Запуск: pnpm exec tsx --test lib/funnel-v2/score-gate.test.ts
//
// Тестируем ЧИСТОЕ решение decideScoreGate (без БД) + извлечение балла:
//   1. autoEnabled=false / отсутствует scoreGate → null (гейт не срабатывает, ручной разбор).
//   2. балл ≥ порога → { pass:true }.
//   3. балл < порога → { pass:false, failAction } (для каждого failAction, включая reserve).
//   4. балл ещё не посчитан (null) → null (ждём).
//   5. извлечение балла по scoreType (resume/anketa/block2/test/portrait).
//   6. нормализация scoreGate (normalizeScoreGate) — включая 'reserve'.

import { test } from "node:test"
import assert from "node:assert/strict"
import { decideScoreGate, scoreForType, getBlock2Score, type CandidateScores } from "./score-gate"
import { normalizeScoreGate, type FunnelV2Stage, type ScoreGate, type ScoreGateFailAction } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Фикстуры
// ─────────────────────────────────────────────────────────────────────────────

/** Стадия с заданным scoreGate (или без). */
function makeStage(scoreGate?: Partial<ScoreGate>): FunnelV2Stage {
  return {
    id: "st-test",
    action: "test",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
      scoreGate: scoreGate
        ? {
            scoreType:   scoreGate.scoreType ?? "resume",
            threshold:   scoreGate.threshold ?? 60,
            failAction:  scoreGate.failAction ?? "manual",
            autoEnabled: scoreGate.autoEnabled ?? true,
          }
        : undefined,
    },
    dozhim: "off",
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. autoEnabled=false / отсутствие гейта → null
// ─────────────────────────────────────────────────────────────────────────────

test("decideScoreGate: нет scoreGate → null (легаси/ручной, ничего не меняем)", () => {
  const stage = makeStage(undefined)
  assert.equal(decideScoreGate(stage, { resumeScore: 10 }), null)
})

test("decideScoreGate: autoEnabled=false → null (гейт выключен)", () => {
  const stage = makeStage({ scoreType: "resume", threshold: 60, failAction: "reject", autoEnabled: false })
  // Балл заведомо ниже порога — но гейт всё равно не срабатывает.
  assert.equal(decideScoreGate(stage, { resumeScore: 0 }), null)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. балл ≥ порога → pass:true
// ─────────────────────────────────────────────────────────────────────────────

test("decideScoreGate: балл ≥ порога → pass:true", () => {
  const stage = makeStage({ scoreType: "resume", threshold: 60, autoEnabled: true })
  assert.deepEqual(decideScoreGate(stage, { resumeScore: 60 }), { pass: true }) // ровно порог
  assert.deepEqual(decideScoreGate(stage, { resumeScore: 90 }), { pass: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. балл < порога → pass:false + failAction (каждый вариант, включая reserve)
// ─────────────────────────────────────────────────────────────────────────────

const FAIL_ACTIONS: ScoreGateFailAction[] = ["preliminary_reject", "manual", "reject", "reserve"]
for (const failAction of FAIL_ACTIONS) {
  test(`decideScoreGate: балл < порога, failAction=${failAction} → pass:false + failAction`, () => {
    const stage = makeStage({ scoreType: "resume", threshold: 60, failAction, autoEnabled: true })
    assert.deepEqual(decideScoreGate(stage, { resumeScore: 40 }), { pass: false, failAction })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. балл ещё не посчитан (null) → null (не гейтим, ждём)
// ─────────────────────────────────────────────────────────────────────────────

test("decideScoreGate: балл null (не посчитан) → null (ждём, не гейтим)", () => {
  const stage = makeStage({ scoreType: "resume", threshold: 60, failAction: "reject", autoEnabled: true })
  assert.equal(decideScoreGate(stage, { resumeScore: null }), null)
  assert.equal(decideScoreGate(stage, {}), null) // поле отсутствует
})

test("decideScoreGate: portrait балл null → null", () => {
  const stage = makeStage({ scoreType: "portrait", threshold: 50, autoEnabled: true })
  assert.equal(decideScoreGate(stage, { aiScoreV2: null }), null)
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. извлечение балла по scoreType
// ─────────────────────────────────────────────────────────────────────────────

test("scoreForType: маппинг resume/anketa/test/portrait", () => {
  const cand: CandidateScores = {
    resumeScore: 11, demoAnswersScore: 22, testScore: 33, aiScoreV2: 44,
  }
  assert.equal(scoreForType("resume", cand), 11)
  assert.equal(scoreForType("anketa", cand), 22)
  assert.equal(scoreForType("test", cand), 33)
  assert.equal(scoreForType("portrait", cand), 44)
})

test("getBlock2Score: второй демо-блок → его score; <2 блоков → null", () => {
  const two: CandidateScores = { demoBlockScores: { a: { score: 70 }, b: { score: 55 } } }
  assert.equal(getBlock2Score(two), 55)
  assert.equal(scoreForType("block2", two), 55)

  const one: CandidateScores = { demoBlockScores: { a: { score: 70 } } }
  assert.equal(getBlock2Score(one), null) // только один блок → block2 нет

  assert.equal(getBlock2Score({ demoBlockScores: null }), null)
  assert.equal(getBlock2Score({}), null)
})

test("decideScoreGate: block2 ≥ порога → pass:true; < порога → reserve", () => {
  const stage = makeStage({ scoreType: "block2", threshold: 50, failAction: "reserve", autoEnabled: true })
  assert.deepEqual(decideScoreGate(stage, { demoBlockScores: { a: { score: 80 }, b: { score: 60 } } }), { pass: true })
  assert.deepEqual(decideScoreGate(stage, { demoBlockScores: { a: { score: 80 }, b: { score: 30 } } }), { pass: false, failAction: "reserve" })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. normalizeScoreGate (валидация из БД)
// ─────────────────────────────────────────────────────────────────────────────

test("normalizeScoreGate: undefined/битое → undefined (гейт отсутствует)", () => {
  assert.equal(normalizeScoreGate(undefined), undefined)
  assert.equal(normalizeScoreGate(null), undefined)
  assert.equal(normalizeScoreGate("x"), undefined)
  assert.equal(normalizeScoreGate({ threshold: 50 }), undefined) // нет scoreType → нет гейта
})

test("normalizeScoreGate: 'reserve' — валидный failAction", () => {
  const g = normalizeScoreGate({ scoreType: "resume", threshold: 60, failAction: "reserve", autoEnabled: true })
  assert.deepEqual(g, { scoreType: "resume", threshold: 60, failAction: "reserve", autoEnabled: true })
})

test("normalizeScoreGate: неизвестный failAction → 'manual'; autoEnabled по умолчанию false", () => {
  const g = normalizeScoreGate({ scoreType: "test", threshold: 70, failAction: "bogus" })
  assert.equal(g?.failAction, "manual")
  assert.equal(g?.autoEnabled, false) // не задан → выкл (ничего не меняется)
})

test("normalizeScoreGate: threshold клампится в 0..100", () => {
  assert.equal(normalizeScoreGate({ scoreType: "resume", threshold: 250, autoEnabled: true })?.threshold, 100)
  assert.equal(normalizeScoreGate({ scoreType: "resume", threshold: -5, autoEnabled: true })?.threshold, 0)
  assert.equal(normalizeScoreGate({ scoreType: "resume", threshold: NaN, autoEnabled: true })?.threshold, 0)
})

test("normalizeScoreGate: autoEnabled только явный true включает; любое другое → false", () => {
  assert.equal(normalizeScoreGate({ scoreType: "resume", threshold: 60, autoEnabled: true })?.autoEnabled, true)
  assert.equal(normalizeScoreGate({ scoreType: "resume", threshold: 60, autoEnabled: "true" })?.autoEnabled, false)
  assert.equal(normalizeScoreGate({ scoreType: "resume", threshold: 60, autoEnabled: 1 })?.autoEnabled, false)
})
