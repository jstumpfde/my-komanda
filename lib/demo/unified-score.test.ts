// Юнит-тесты единого балла «Анкета» (Вариант Б, решение Юрия 05.07).
// Запуск: pnpm exec tsx --test lib/demo/unified-score.test.ts
//
// Тестируем ЧИСТУЮ функцию computeUnifiedAnketaScore:
//   1. Сдана только часть 1 — балл совпадает с баллом части 1 байт-в-байт.
//   2. Сданы обе части — балл считается по сумме awarded/max ОБЕИХ частей.
//   3. Часть 2 без пер-вопросных данных (breakdown пуст) — не тянет знаменатель,
//      балл остаётся как у части 1 (max=0 у пустого блока не влияет на сумму).
//   4. Нет второй части у вакансии (только один answered-блок) — как п.1.

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeUnifiedAnketaScore, type UnifiedScoreBlockInput } from "./unified-score"

function block(demoId: string, entries: Array<{ awarded: number; max: number }>): UnifiedScoreBlockInput {
  const breakdown = entries.map((e, i) => ({
    questionText: `Вопрос ${i + 1}`,
    awarded: e.awarded,
    max: e.max,
    comment: "",
  }))
  const sumAwarded = entries.reduce((s, e) => s + e.awarded, 0)
  const sumMax = entries.reduce((s, e) => s + e.max, 0)
  const score = sumMax > 0 ? Math.round((sumAwarded / sumMax) * 100) : 0
  return { demoId, title: demoId, score, breakdown }
}

test("только часть 1 — единый балл совпадает с баллом части 1 байт-в-байт", () => {
  const part1 = block("demo-1", [{ awarded: 4, max: 5 }, { awarded: 3, max: 5 }])
  const result = computeUnifiedAnketaScore([part1], 1)
  assert.ok(result)
  // 7/10 = 70
  assert.equal(result!.score, part1.score)
  assert.equal(result!.score, 70)
  assert.equal(result!.partsAnswered, 1)
  assert.equal(result!.partsTotal, 1)
})

test("обе части сданы — балл считается по сумме awarded/max обеих частей", () => {
  const part1 = block("demo-1", [{ awarded: 4, max: 5 }, { awarded: 3, max: 5 }]) // 7/10
  const part2 = block("demo-2", [{ awarded: 5, max: 5 }, { awarded: 5, max: 5 }]) // 10/10
  const result = computeUnifiedAnketaScore([part1, part2], 2)
  assert.ok(result)
  // (7+10)/(10+10) = 17/20 = 85
  assert.equal(result!.score, 85)
  assert.equal(result!.partsAnswered, 2)
  assert.equal(result!.partsTotal, 2)
  // Не должно совпадать ни с частью 1, ни с частью 2 по отдельности —
  // подтверждает, что это действительно объединённый балл, а не один из блоков.
  assert.notEqual(result!.score, part1.score)
  assert.notEqual(result!.score, part2.score)
})

test("часть 2 без пер-вопросных данных (пустой breakdown) — знаменатель не тянет вниз", () => {
  const part1 = block("demo-1", [{ awarded: 8, max: 10 }]) // 80
  const part2Empty: UnifiedScoreBlockInput = { demoId: "demo-2", title: "demo-2", score: 0, breakdown: [] }
  const result = computeUnifiedAnketaScore([part1, part2Empty], 2)
  assert.ok(result)
  // sumAwarded=8, sumMax=10 (пустой блок добавляет 0/0) → тот же балл, что и часть 1.
  assert.equal(result!.score, 80)
  assert.equal(result!.partsAnswered, 2)
})

test("нет второй части у вакансии — единый балл = баллу единственного блока", () => {
  const onlyPart = block("demo-1", [{ awarded: 2, max: 4 }]) // 50
  const result = computeUnifiedAnketaScore([onlyPart], 1)
  assert.ok(result)
  assert.equal(result!.score, 50)
  assert.equal(result!.partsAnswered, 1)
  assert.equal(result!.partsTotal, 1)
})

test("нет ни одного answered-блока — возвращает null", () => {
  const result = computeUnifiedAnketaScore([], 2)
  assert.equal(result, null)
})

test("partsTotal защитно клампится вверх до фактического числа answered-блоков", () => {
  // Если partsTotal передан меньше факта (напр. рассинхрон), не теряем прогресс.
  const part1 = block("demo-1", [{ awarded: 1, max: 1 }])
  const part2 = block("demo-2", [{ awarded: 1, max: 1 }])
  const result = computeUnifiedAnketaScore([part1, part2], 1)
  assert.ok(result)
  assert.equal(result!.partsTotal, 2)
})
