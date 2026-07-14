// Юнит-тесты гейта мягкого напоминания «пройдите Демо-3 до интервью»
// (decideDemo3BeforeInterview). Форвард-механизм 14.07.
// Запуск: pnpm exec tsx --test lib/messaging/demo3-before-interview.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { decideDemo3BeforeInterview } from "./demo3-gate"

// Скорируемый демо-блок: lessons_json с блоком type="task" и вопросом с aiCriteria.
function scorableLessons(blockId: string) {
  return [
    {
      blocks: [
        {
          id: blockId,
          type: "task",
          questions: [
            { id: `${blockId}-q1`, text: "Вопрос", options: [], points: 5, aiCriteria: "критерий" },
          ],
        },
      ],
    },
  ]
}

// НЕскорируемый блок: только презентационный контент, без task-вопросов.
function nonScorableLessons(blockId: string) {
  return [{ blocks: [{ id: blockId, type: "text", content: "Просто текст" }] }]
}

const DEMO1 = { id: "demo-1", title: "Презентация", lessonsJson: scorableLessons("b1") }
const DEMO2 = { id: "demo-2", title: "Путь менеджера", lessonsJson: scorableLessons("b2") }
const DEMO3 = { id: "demo-3", title: "Демо-3", lessonsJson: scorableLessons("b3") }

test("одно демо → напоминание НЕ ставится (гейт молчит, поведение прежнее)", () => {
  const d = decideDemo3BeforeInterview({
    demoRows: [DEMO1],
    demoBlockScores: null, // даже без единого пройденного блока
  })
  assert.equal(d.shouldRemind, false)
  assert.equal(d.reason, "single_demo")
  assert.equal(d.demoBlockCount, 1)
})

test("3 демо, последний скорируемый, кандидат НЕ прошёл Демо-3 → напоминание ставится", () => {
  const d = decideDemo3BeforeInterview({
    demoRows: [DEMO1, DEMO2, DEMO3],
    // прошёл Д1 и Д2, ключа Д3 нет
    demoBlockScores: { "demo-1": { score: 80 }, "demo-2": { score: 70 } },
  })
  assert.equal(d.shouldRemind, true)
  assert.equal(d.reason, "remind")
  assert.equal(d.demo3Id, "demo-3")
  assert.equal(d.demoBlockCount, 3)
})

test("3 демо, кандидат УЖЕ прошёл Демо-3 → напоминание НЕ ставится", () => {
  const d = decideDemo3BeforeInterview({
    demoRows: [DEMO1, DEMO2, DEMO3],
    demoBlockScores: { "demo-1": { score: 80 }, "demo-2": { score: 70 }, "demo-3": { score: 60 } },
  })
  assert.equal(d.shouldRemind, false)
  assert.equal(d.reason, "already_passed")
  assert.equal(d.demo3Id, "demo-3")
})

test("последний демо-блок НЕскорируемый → напоминание НЕ ставится (иначе слали бы всем)", () => {
  const d = decideDemo3BeforeInterview({
    demoRows: [DEMO1, { id: "demo-2", title: "Финал", lessonsJson: nonScorableLessons("b2") }],
    demoBlockScores: { "demo-1": { score: 80 } },
  })
  assert.equal(d.shouldRemind, false)
  assert.equal(d.reason, "last_not_scorable")
})

test("2 демо, последний (Д2) скорируемый и не пройден → напоминание ставится на Д2", () => {
  const d = decideDemo3BeforeInterview({
    demoRows: [DEMO1, DEMO2],
    demoBlockScores: { "demo-1": { score: 80 } },
  })
  assert.equal(d.shouldRemind, true)
  assert.equal(d.reason, "remind")
  assert.equal(d.demo3Id, "demo-2")
  assert.equal(d.demoBlockCount, 2)
})

test("нет демо вообще → напоминание НЕ ставится", () => {
  const d = decideDemo3BeforeInterview({ demoRows: [], demoBlockScores: null })
  assert.equal(d.shouldRemind, false)
  assert.equal(d.reason, "single_demo")
  assert.equal(d.demoBlockCount, 0)
})
