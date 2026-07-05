// Юнит-тесты ИЛИ-гейта «2-я часть демо» (бесшовный переход, фикс osечки 05.07).
// Запуск: pnpm exec tsx --test lib/demo/anketa-pass-gate.test.ts
//
// Тестируем ЧИСТЫЕ функции (без БД):
//   1. decideAnketaPassGate — объективный балл проходит порог.
//   2. decideAnketaPassGate — AI-оценка проходит порог (объективного нет/ниже).
//   3. decideAnketaPassGate — ни один балл не посчитан → not_applicable.
//   4. decideAnketaPassGate — оба балла есть, оба ниже порогов → below_threshold.
//   5. decideAnketaPassGate — приоритет отчёта "objective", если оба прошли.
//   6. resolveTransferMode — явный transferMode / обратная совместимость с inlineContinue.
//   7. shouldSendPassInviteMessage / shouldAdvanceInline — слать/не слать письмо,
//      показывать/не показывать инлайн-переход для каждого режима.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  decideAnketaPassGate,
  resolveTransferMode,
  shouldSendPassInviteMessage,
  shouldAdvanceInline,
  DEFAULT_AI_EVAL_THRESHOLD,
} from "./anketa-pass-gate"

const THRESHOLDS = { passThreshold: 35, aiEvalThreshold: 45 }

// ─────────────────────────────────────────────────────────────────────────────
// decideAnketaPassGate
// ─────────────────────────────────────────────────────────────────────────────

test("decideAnketaPassGate: объективный балл >= порога — проходит через objective", () => {
  const result = decideAnketaPassGate({ objectiveScore: 40, aiEvalScore: null }, THRESHOLDS)
  assert.deepEqual(result, { passed: true, via: "objective", score: 40 })
})

test("decideAnketaPassGate: AI-оценка >= порога, объективного балла нет — проходит через ai_eval", () => {
  const result = decideAnketaPassGate({ objectiveScore: null, aiEvalScore: 50 }, THRESHOLDS)
  assert.deepEqual(result, { passed: true, via: "ai_eval", score: 50 })
})

test("decideAnketaPassGate: AI-оценка >= порога, объективный балл ниже порога — всё равно проходит (ИЛИ)", () => {
  const result = decideAnketaPassGate({ objectiveScore: 10, aiEvalScore: 60 }, THRESHOLDS)
  assert.equal(result.passed, true)
  if (result.passed) {
    assert.equal(result.via, "ai_eval")
    assert.equal(result.score, 60)
  }
})

test("decideAnketaPassGate: оба балла null — гейт неприменим (not_applicable), не below_threshold", () => {
  const result = decideAnketaPassGate({ objectiveScore: null, aiEvalScore: null }, THRESHOLDS)
  assert.deepEqual(result, { passed: false, reason: "not_applicable" })
})

test("decideAnketaPassGate: оба балла есть, оба ниже порогов — below_threshold", () => {
  const result = decideAnketaPassGate({ objectiveScore: 20, aiEvalScore: 30 }, THRESHOLDS)
  assert.equal(result.passed, false)
  if (!result.passed) {
    assert.equal(result.reason, "below_threshold")
    if (result.reason === "below_threshold") assert.equal(result.score, 20)
  }
})

test("decideAnketaPassGate: только AI-оценка ниже порога, объективного нет — below_threshold со score=aiEval", () => {
  const result = decideAnketaPassGate({ objectiveScore: null, aiEvalScore: 30 }, THRESHOLDS)
  assert.equal(result.passed, false)
  if (!result.passed && result.reason === "below_threshold") {
    assert.equal(result.score, 30)
  } else {
    assert.fail("ожидали below_threshold")
  }
})

test("decideAnketaPassGate: оба балла проходят пороги — приоритет отчёта objective", () => {
  const result = decideAnketaPassGate({ objectiveScore: 90, aiEvalScore: 90 }, THRESHOLDS)
  assert.equal(result.passed, true)
  if (result.passed) assert.equal(result.via, "objective")
})

test("decideAnketaPassGate: граница — балл ровно на пороге проходит (>=, не строго >)", () => {
  const result = decideAnketaPassGate({ objectiveScore: 35, aiEvalScore: null }, THRESHOLDS)
  assert.equal(result.passed, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveTransferMode
// ─────────────────────────────────────────────────────────────────────────────

test("resolveTransferMode: явный seamless — используется как есть", () => {
  assert.equal(resolveTransferMode({ transferMode: "seamless" }), "seamless")
})

test("resolveTransferMode: явный message — используется как есть", () => {
  assert.equal(resolveTransferMode({ transferMode: "message" }), "message")
})

test("resolveTransferMode: явный both — используется как есть", () => {
  assert.equal(resolveTransferMode({ transferMode: "both" }), "both")
})

test("resolveTransferMode: старый спек без transferMode, inlineContinue=false — трактуем как message", () => {
  assert.equal(resolveTransferMode({ inlineContinue: false }), "message")
})

test("resolveTransferMode: старый спек без transferMode, inlineContinue=true/отсутствует — трактуем как both", () => {
  assert.equal(resolveTransferMode({ inlineContinue: true }), "both")
  assert.equal(resolveTransferMode({}), "both")
  assert.equal(resolveTransferMode(null), "both")
  assert.equal(resolveTransferMode(undefined), "both")
})

test("resolveTransferMode: мусорное значение transferMode — фолбэк на inlineContinue-логику", () => {
  assert.equal(resolveTransferMode({ transferMode: "bogus", inlineContinue: false }), "message")
})

// ─────────────────────────────────────────────────────────────────────────────
// shouldSendPassInviteMessage / shouldAdvanceInline — дедуп «слать/не слать»
// ─────────────────────────────────────────────────────────────────────────────

test("seamless: письмо НЕ шлём, инлайн-переход показываем", () => {
  assert.equal(shouldSendPassInviteMessage("seamless"), false)
  assert.equal(shouldAdvanceInline("seamless"), true)
})

test("message: письмо шлём, инлайн-перехода нет", () => {
  assert.equal(shouldSendPassInviteMessage("message"), true)
  assert.equal(shouldAdvanceInline("message"), false)
})

test("both: и письмо (страховка), и инлайн-переход", () => {
  assert.equal(shouldSendPassInviteMessage("both"), true)
  assert.equal(shouldAdvanceInline("both"), true)
})

test("DEFAULT_AI_EVAL_THRESHOLD совпадает с дефолтом схемы (types.ts AnketaPassInviteSchema)", () => {
  assert.equal(DEFAULT_AI_EVAL_THRESHOLD, 45)
})
