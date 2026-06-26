// Юнит-тесты оценки продуктивности и нормы.
// Запуск: pnpm exec tsx --test lib/dev-activity/scoring.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  scoreTasks,
  median,
  verdictFor,
  computeSeries,
  dayOffset,
  estimateWorkMinutes,
  SESSION_LEAD_MIN,
  KIND_WEIGHT,
  type SeriesPoint,
} from "./scoring"

test("estimateWorkMinutes: эвристика git-hours", () => {
  assert.equal(estimateWorkMinutes([]), 0)
  // один коммит → только время на разгон
  assert.equal(estimateWorkMinutes(["2026-06-25T10:00:00+03:00"]), SESSION_LEAD_MIN)
  // три коммита подряд с разрывом 30м → разгон + 30 + 30 = 120
  assert.equal(estimateWorkMinutes([
    "2026-06-25T10:00:00+03:00",
    "2026-06-25T10:30:00+03:00",
    "2026-06-25T11:00:00+03:00",
  ]), SESSION_LEAD_MIN + 60)
  // разрыв > 2ч → новая сессия (ещё +разгон), порядок не важен
  assert.equal(estimateWorkMinutes([
    "2026-06-25T15:00:00+03:00",
    "2026-06-25T10:00:00+03:00",
  ]), SESSION_LEAD_MIN * 2)
})

test("scoreTasks взвешивает по содержательности", () => {
  assert.equal(scoreTasks([]), 0)
  assert.equal(scoreTasks([{ kind: "normal" }, { kind: "normal" }]), 2)
  assert.equal(scoreTasks([{ kind: "substantial" }]), KIND_WEIGHT.substantial)
  assert.equal(scoreTasks([{ kind: "trivial" }, { kind: "trivial" }, { kind: "trivial" }]), 0.9)
  // крупная + рядовая + пустяк
  assert.equal(scoreTasks([{ kind: "substantial" }, { kind: "normal" }, { kind: "trivial" }]), 4.3)
})

test("median для чётного и нечётного количества", () => {
  assert.equal(median([]), 0)
  assert.equal(median([5]), 5)
  assert.equal(median([1, 3]), 2)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 10]), 2.5)
})

test("verdictFor: без нормы → warmup, 0 → silence", () => {
  assert.equal(verdictFor(5, null), "warmup")
  assert.equal(verdictFor(0, null), "warmup")
  assert.equal(verdictFor(0, 3), "silence")
})

test("verdictFor: пороги ниже/норма/выше", () => {
  // норма 4: ниже < 2, выше > 6
  assert.equal(verdictFor(1.5, 4), "below")
  assert.equal(verdictFor(2, 4), "normal")   // ровно 50% — уже не below
  assert.equal(verdictFor(4, 4), "normal")
  assert.equal(verdictFor(6, 4), "normal")   // ровно 150% — ещё не above
  assert.equal(verdictFor(7, 4), "above")
})

test("computeSeries: первые дни warmup, дальше сравнение с медианой ненулевых", () => {
  // 5 ненулевых дней по 4 балла, затем тест-дни
  const points: SeriesPoint[] = [
    { day: "2026-06-01", score: 4 },
    { day: "2026-06-02", score: 4 },
    { day: "2026-06-03", score: 4 },
    { day: "2026-06-04", score: 4 },
    { day: "2026-06-05", score: 4 },
    { day: "2026-06-06", score: 4 },  // 6-й день: есть 5 ненулевых до него → норма=4
    { day: "2026-06-07", score: 1 },  // ниже нормы
    { day: "2026-06-08", score: 0 },  // тишина
    { day: "2026-06-09", score: 9 },  // выше нормы
  ]
  const res = computeSeries(points)
  const by = Object.fromEntries(res.map(r => [r.day, r]))

  // Первые 5 дней — мало истории
  assert.equal(by["2026-06-01"].verdict, "warmup")
  assert.equal(by["2026-06-05"].verdict, "warmup")
  // 6-й: норма посчиталась
  assert.equal(by["2026-06-06"].baseline, 4)
  assert.equal(by["2026-06-06"].verdict, "normal")
  assert.equal(by["2026-06-07"].verdict, "below")
  assert.equal(by["2026-06-08"].verdict, "silence")
  assert.equal(by["2026-06-09"].verdict, "above")
})

test("computeSeries: тихие дни не занижают норму", () => {
  // Перемежаем рабочие дни (4) тихими (0). Норма должна остаться 4, а не упасть.
  const points: SeriesPoint[] = []
  for (let i = 1; i <= 10; i++) {
    points.push({ day: `2026-06-${String(i).padStart(2, "0")}`, score: i % 2 === 0 ? 4 : 0 })
  }
  points.push({ day: "2026-06-11", score: 3 })
  const res = computeSeries(points)
  const last = res.find(r => r.day === "2026-06-11")!
  assert.equal(last.baseline, 4)        // медиана ненулевых = 4
  assert.equal(last.verdict, "normal")  // 3 в пределах [2..6]
})

test("dayOffset считает корректно через границы месяца", () => {
  assert.equal(dayOffset("2026-06-01", -1), "2026-05-31")
  assert.equal(dayOffset("2026-06-15", -28), "2026-05-18")
  assert.equal(dayOffset("2026-06-30", 1), "2026-07-01")
})
