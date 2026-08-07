// Юнит-тесты единого слоя определений отчёта (lib/hr/metrics.ts).
// Запуск: pnpm exec tsx --test lib/hr/metrics.test.ts
//
// Покрываем контракт resolveEventDate/latestTransitionAt — приоритет
// primary-колонка > stage_history > fallback (created_at) — на граничных
// случаях: кандидат без истории, двойной переход, переход вне целевых стадий.

import { test } from "node:test"
import assert from "node:assert/strict"
import { latestTransitionAt, resolveEventDate, HIRED_TARGET_STAGES } from "./metrics"

test("latestTransitionAt: нет истории (undefined/null) → null", () => {
  assert.equal(latestTransitionAt(undefined, HIRED_TARGET_STAGES), null)
  assert.equal(latestTransitionAt(null, HIRED_TARGET_STAGES), null)
})

test("latestTransitionAt: история не массив (грязные данные) → null, без исключения", () => {
  assert.equal(latestTransitionAt("not-an-array", HIRED_TARGET_STAGES), null)
  assert.equal(latestTransitionAt({ foo: "bar" }, HIRED_TARGET_STAGES), null)
})

test("latestTransitionAt: пустая история → null", () => {
  assert.equal(latestTransitionAt([], HIRED_TARGET_STAGES), null)
})

test("latestTransitionAt: единственный подходящий переход → его дата", () => {
  const history = [
    { from: "new", to: "primary_contact", at: "2026-05-01T10:00:00Z" },
    { from: "primary_contact", to: "hired", at: "2026-07-15T12:30:00Z" },
  ]
  assert.equal(
    latestTransitionAt(history, HIRED_TARGET_STAGES)?.toISOString(),
    "2026-07-15T12:30:00.000Z",
  )
})

test("latestTransitionAt: переход дважды (напр. hired → rejected → hired) — берём ПОСЛЕДНИЙ по дате", () => {
  const history = [
    { from: "new", to: "hired", at: "2026-06-01T00:00:00Z" },
    { from: "hired", to: "rejected", at: "2026-06-10T00:00:00Z" },
    { from: "rejected", to: "hired", at: "2026-07-20T00:00:00Z" },
  ]
  assert.equal(
    latestTransitionAt(history, HIRED_TARGET_STAGES)?.toISOString(),
    "2026-07-20T00:00:00.000Z",
  )
})

test("latestTransitionAt: переход есть, но в другую (не целевую) стадию → null", () => {
  const history = [
    { from: "new", to: "primary_contact", at: "2026-05-01T10:00:00Z" },
    { from: "primary_contact", to: "rejected", at: "2026-05-05T10:00:00Z" },
  ]
  assert.equal(latestTransitionAt(history, HIRED_TARGET_STAGES), null)
})

test("latestTransitionAt: запись без даты (at отсутствует) игнорируется", () => {
  const history = [
    { from: "new", to: "hired" }, // нет at/date
  ]
  assert.equal(latestTransitionAt(history, HIRED_TARGET_STAGES), null)
})

test("latestTransitionAt: старый формат с полем date вместо at", () => {
  const history = [
    { from: "new", to: "hired", date: "2026-04-01T00:00:00Z" },
  ]
  assert.equal(
    latestTransitionAt(history, HIRED_TARGET_STAGES)?.toISOString(),
    "2026-04-01T00:00:00.000Z",
  )
})

test("resolveEventDate: primary-колонка задана → побеждает, история не смотрится", () => {
  const result = resolveEventDate({
    primary: "2026-08-01T00:00:00Z",
    stageHistory: [{ to: "hired", at: "2026-01-01T00:00:00Z" }],
    targetStages: HIRED_TARGET_STAGES,
    fallback: "2026-01-01T00:00:00Z",
  })
  assert.equal(result?.toISOString(), "2026-08-01T00:00:00.000Z")
})

test("resolveEventDate: нет primary, но есть подходящий переход в истории → дата перехода", () => {
  const result = resolveEventDate({
    primary: null,
    stageHistory: [{ to: "hired", at: "2026-07-15T12:30:00Z" }],
    targetStages: HIRED_TARGET_STAGES,
    fallback: "2026-05-01T00:00:00Z",
  })
  assert.equal(result?.toISOString(), "2026-07-15T12:30:00.000Z")
})

test("resolveEventDate: кандидат без stage_history и без primary → fallback (дата отклика), не пропадает", () => {
  const result = resolveEventDate({
    primary: null,
    stageHistory: null,
    targetStages: HIRED_TARGET_STAGES,
    fallback: "2026-03-10T00:00:00Z",
  })
  assert.equal(result?.toISOString(), "2026-03-10T00:00:00.000Z")
})

test("resolveEventDate: вообще ничего не задано → null", () => {
  const result = resolveEventDate({})
  assert.equal(result, null)
})

test("resolveEventDate: started_work засчитывается как «нанят» (HIRED_TARGET_STAGES)", () => {
  const result = resolveEventDate({
    primary: null,
    stageHistory: [{ to: "started_work", at: "2026-07-20T00:00:00Z" }],
    targetStages: HIRED_TARGET_STAGES,
    fallback: null,
  })
  assert.equal(result?.toISOString(), "2026-07-20T00:00:00.000Z")
})
