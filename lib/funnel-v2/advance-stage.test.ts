// Юнит-тесты чистой логики продвижения стадий воронки v2 (Фаза 0).
// Запуск: pnpm exec tsx --test lib/funnel-v2/advance-stage.test.ts
//
// Тестируем только nextStageId — чистую функцию без IO.
// advanceToNextStage (заглушка с throw) и scheduleV2Rejection — не тестируем
// (реализация в Фазе 1).

import { test } from "node:test"
import assert from "node:assert/strict"
import { nextStageId } from "./advance-stage"
import type { FunnelV2Stage } from "./types"

// ── Фикстура: три стадии по порядку ──────────────────────────────────────────

function makeStages(): FunnelV2Stage[] {
  return [
    {
      id: "st-msg",
      action: "message",
      rule: { autoAdvance: true, autoReject: false, rejectDelayMinutes: 60 },
      dozhim: "off",
    },
    {
      id: "st-demo",
      action: "demo",
      rule: { autoAdvance: false, autoReject: true, threshold: 60, rejectDelayMinutes: 120 },
      dozhim: "standard",
    },
    {
      id: "st-hired",
      action: "hired",
      rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 },
      dozhim: "off",
    },
  ]
}

// ── advanceTo задан явно (ветвление) ─────────────────────────────────────────

test("advanceTo=конкретный id → возвращает тот id (ветвление)", () => {
  const stages = makeStages()
  // Перескакиваем с первой стадии сразу на третью
  assert.equal(nextStageId(stages, "st-msg", "st-hired"), "st-hired")
})

test("advanceTo=несуществующий id → деградирует к порядку (следующая)", () => {
  const stages = makeStages()
  // Целевая стадия 'st-unknown' не найдена → используем следующую по порядку
  assert.equal(nextStageId(stages, "st-msg", "st-unknown"), "st-demo")
})

test("advanceTo='next' → следующая по порядку (как будто не задан)", () => {
  const stages = makeStages()
  assert.equal(nextStageId(stages, "st-msg", "next"), "st-demo")
})

// ── advanceTo не задан → следующая по порядку ────────────────────────────────

test("advanceTo не задан → следующая стадия по порядку", () => {
  const stages = makeStages()
  assert.equal(nextStageId(stages, "st-msg"), "st-demo")
  assert.equal(nextStageId(stages, "st-demo"), "st-hired")
})

// ── Последняя стадия → null ──────────────────────────────────────────────────

test("последняя стадия без advanceTo → null (конец воронки)", () => {
  const stages = makeStages()
  assert.equal(nextStageId(stages, "st-hired"), null)
})

test("последняя стадия с advanceTo='next' → null (конец воронки)", () => {
  const stages = makeStages()
  assert.equal(nextStageId(stages, "st-hired", "next"), null)
})

// ── currentId не найден → null ───────────────────────────────────────────────

test("currentId не найден в stages → null", () => {
  const stages = makeStages()
  assert.equal(nextStageId(stages, "st-nonexistent"), null)
})

// ── Граничные: пустой массив стадий ─────────────────────────────────────────

test("пустой массив стадий → null", () => {
  assert.equal(nextStageId([], "st-msg"), null)
})

// ── Одна стадия → null ───────────────────────────────────────────────────────

test("единственная стадия → null (она же последняя)", () => {
  const stages: FunnelV2Stage[] = [{
    id: "st-only",
    action: "hired",
    rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 },
    dozhim: "off",
  }]
  assert.equal(nextStageId(stages, "st-only"), null)
})
