// Юнит-тесты чистой логики продвижения стадий воронки v2 (Фаза 0).
// Запуск: pnpm exec tsx --test lib/funnel-v2/advance-stage.test.ts
//
// Тестируем только nextStageId — чистую функцию без IO.
// advanceToNextStage (заглушка с throw) и scheduleV2Rejection — не тестируем
// (реализация в Фазе 1).

import { test } from "node:test"
import assert from "node:assert/strict"
import { nextStageId, firstEnabledStageId, resolveAdvanceTarget } from "./advance-stage"
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

// ── Воронка 3: выключенные стадии (enabled===false) пропускаются ─────────────

function makeStagesWithDisabled(): FunnelV2Stage[] {
  const stages = makeStages()
  stages[1] = { ...stages[1], enabled: false } // st-demo выключена
  return stages
}

test("enabled=false: следующая по порядку пропускает выключенную", () => {
  const stages = makeStagesWithDisabled()
  // st-msg → (st-demo выключена, скачем через неё) → st-hired
  assert.equal(nextStageId(stages, "st-msg"), "st-hired")
})

test("enabled=false: advanceTo указывает на выключенную → следующая включённая после неё", () => {
  const stages = makeStagesWithDisabled()
  assert.equal(nextStageId(stages, "st-msg", "st-demo"), "st-hired")
})

test("enabled=false: все последующие выключены → null (конец воронки)", () => {
  const stages = makeStages().map((s, i) => i === 0 ? s : { ...s, enabled: false })
  assert.equal(nextStageId(stages, "st-msg"), null)
})

test("enabled не задан / true → прежнее поведение (ничего не пропускаем)", () => {
  const stages = makeStages()
  stages[1] = { ...stages[1], enabled: true }
  assert.equal(nextStageId(stages, "st-msg"), "st-demo")
})

test("firstEnabledStageId: первая включённая; пустой список → null", () => {
  const stages = makeStagesWithDisabled()
  assert.equal(firstEnabledStageId(stages), "st-msg")
  const firstOff = stages.map((s, i) => i === 0 ? { ...s, enabled: false } : s)
  assert.equal(firstEnabledStageId(firstOff), "st-hired")
  assert.equal(firstEnabledStageId([]), null)
  assert.equal(firstEnabledStageId(stages.map(s => ({ ...s, enabled: false }))), null)
})

// ── Fix предохранителя «ложный Нанят»: resolveAdvanceTarget ──────────────────
// null от nextStageId бывает в ДВУХ случаях: реальный конец массива (complete →
// hired, прежнее поведение) и «дальше есть стадии, но все выключены» (hold →
// ручной разбор, НЕ hired).

test("resolveAdvanceTarget: гейт пройден, хвост выключен → hold (НЕ hired)", () => {
  const stages = makeStages()
  stages[1] = { ...stages[1], enabled: false } // st-demo выкл
  stages[2] = { ...stages[2], enabled: false } // st-hired выкл
  assert.deepEqual(resolveAdvanceTarget(stages, "st-msg"),
    { kind: "hold", reason: "disabled_tail" })
})

test("resolveAdvanceTarget: текущая — последняя стадия массива → complete (hired, прежнее поведение)", () => {
  const stages = makeStages()
  assert.deepEqual(resolveAdvanceTarget(stages, "st-hired"), { kind: "complete" })
})

test("resolveAdvanceTarget: обычное продвижение → advance со следующей включённой", () => {
  const stages = makeStages()
  assert.deepEqual(resolveAdvanceTarget(stages, "st-msg"), { kind: "advance", stageId: "st-demo" })
  // Средняя выключена → скачок через неё
  const withOff = makeStages()
  withOff[1] = { ...withOff[1], enabled: false }
  assert.deepEqual(resolveAdvanceTarget(withOff, "st-msg"), { kind: "advance", stageId: "st-hired" })
})

test("resolveAdvanceTarget: advanceTo на выключенный хвост → hold (НЕ hired)", () => {
  const stages = makeStages()
  stages[2] = { ...stages[2], enabled: false } // st-hired выкл
  // Явное ветвление на выключенную последнюю стадию: дальше включённых нет,
  // но текущая (st-msg) НЕ последняя в массиве → hold.
  assert.deepEqual(resolveAdvanceTarget(stages, "st-msg", "st-hired"),
    { kind: "hold", reason: "disabled_tail" })
})

test("resolveAdvanceTarget: текущая стадия не найдена в конфиге → hold (НЕ hired)", () => {
  const stages = makeStages()
  assert.deepEqual(resolveAdvanceTarget(stages, "st-ghost"),
    { kind: "hold", reason: "stage_not_found" })
})

test("resolveAdvanceTarget: advanceTo на выключенную стадию НАЗАД → hold advance_to_self (не самопереход)", () => {
  // [A(off), B(on, current, advanceTo=A)]: firstEnabledFrom(A) вернул бы B —
  // текущую стадию. Самопереход = повторная отправка входа (риск цикла) → hold.
  const stages = makeStages()
  stages[0] = { ...stages[0], enabled: false }                       // A = st-msg (выкл)
  // current = st-demo (B), advanceTo указывает назад на выключенную A
  assert.deepEqual(resolveAdvanceTarget(stages, "st-demo", "st-msg"),
    { kind: "hold", reason: "advance_to_self" })
})

test("resolveAdvanceTarget: возобновление hold — стадию включили обратно → advance (п.6 гвард №4)", () => {
  // Пока хвост выключен — hold; включили B обратно → advance на B (этим
  // правилом funnel-v2-tick возобновляет hold-кандидатов).
  const heldStages = makeStages()
  heldStages[1] = { ...heldStages[1], enabled: false } // B=st-demo выкл
  heldStages[2] = { ...heldStages[2], enabled: false } // C=st-hired выкл
  assert.deepEqual(resolveAdvanceTarget(heldStages, "st-msg"),
    { kind: "hold", reason: "disabled_tail" })

  const resumedStages = heldStages.map(s => s.id === "st-demo" ? { ...s, enabled: true } : s)
  assert.deepEqual(resolveAdvanceTarget(resumedStages, "st-msg"),
    { kind: "advance", stageId: "st-demo" })
})
