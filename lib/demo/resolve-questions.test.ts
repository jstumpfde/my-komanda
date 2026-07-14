// Юнит-тесты hasAnsweredAllRequired (14.07, разведка Revoluterra «12/12 · 1/2»).
//
// Баг: у вакансии с ДВУМЯ последовательными демо-частями (напр. «Презентация»
// → «Путь менеджера», конструктор воронки, kind='block:%') старая логика
// триггерила «пройдено по ответам» = true, как только кандидат отвечал на
// обязательные вопросы ХОТЯ БЫ ОДНОЙ части — это было рассчитано на
// взаимоисключающие альтернативные демо, а не на последовательные части.
// Итог: колонка «Демо» показывала зелёные «12/12» (100%, как будто всё
// пройдено) сразу после части 1, хотя честный индикатор частей анкеты рядом
// (candidates.demo_block_scores → anketaPartsAnswered/anketaPartsTotal,
// колонка «Анкета») верно писал «1/2» — часть 2 кандидат ещё не открывал.
//
// Прод-проверка (14.07, вакансия Revoluterra 6916db01…, read-only SELECT):
// из 260 кандидатов с demo_progress_json НИ ОДИН не имеет реальных ответов на
// скорируемые вопросы части 2 без соответствующего ключа в demo_block_scores
// (индикатор «N/M» честен). Но 144 кандидата, ответившие ТОЛЬКО на часть 1,
// показывали self-referential «12/12» (полностью зелёное 100%) в колонке
// «Демо» — вводя в заблуждение, что демо пройдено целиком. Фикс: при ≥2
// частей с обязательными вопросами «пройдено по ответам» требует ВСЕ части.
//
// Запуск: pnpm exec tsx --test lib/demo/resolve-questions.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { hasAnsweredAllRequired } from "./resolve-questions"

function taskBlock(id: string, questionId: string, required: boolean) {
  return {
    id,
    type: "task",
    taskTitle: "Вопрос",
    questions: [
      { id: questionId, text: "Текст вопроса", options: [], answerType: "short", required, aiCriteria: "критерий" },
    ],
  }
}

// Часть 1 («Презентация»): один обязательный вопрос.
const PART1 = [
  { id: "les-1", blocks: [taskBlock("blk-p1-q1", "q-p1-q1", true)] },
]

// Часть 2 («Путь менеджера»): один обязательный вопрос, другой blockId/questionId.
const PART2 = [
  { id: "les-2", blocks: [taskBlock("blk-p2-q1", "q-p2-q1", true)] },
]

// Демо без обязательных вопросов вообще (decorative-only) — не должно
// учитываться как «часть».
const NO_REQUIRED = [
  { id: "les-3", blocks: [taskBlock("blk-p3-q1", "q-p3-q1", false)] },
]

function answer(blockId: string, questionId: string, value = "ответ кандидата") {
  return { blockId, answer: { [questionId]: value }, answeredAt: "2026-07-14T00:00:00.000Z" }
}

test("одно демо (без частей): все обязательные отвечены → true (старое поведение)", () => {
  const answers = [answer("blk-p1-q1", "q-p1-q1")]
  assert.equal(hasAnsweredAllRequired([PART1], answers), true)
})

test("одно демо: обязательный вопрос НЕ отвечен → false", () => {
  assert.equal(hasAnsweredAllRequired([PART1], []), false)
})

test("две ПОСЛЕДОВАТЕЛЬНЫЕ части: отвечена только часть 1 → false (регрессия бага 14.07)", () => {
  // ДО фикса: возвращало true (OR по частям) — ложное «демо пройдено на 100%»
  // в колонке «Демо», хотя часть 2 кандидат не открывал.
  const answers = [answer("blk-p1-q1", "q-p1-q1")]
  assert.equal(hasAnsweredAllRequired([PART1, PART2], answers), false)
})

test("две ПОСЛЕДОВАТЕЛЬНЫЕ части: отвечена только часть 2 → false (нужны обе)", () => {
  const answers = [answer("blk-p2-q1", "q-p2-q1")]
  assert.equal(hasAnsweredAllRequired([PART1, PART2], answers), false)
})

test("две ПОСЛЕДОВАТЕЛЬНЫЕ части: отвечены ОБЕ → true", () => {
  const answers = [answer("blk-p1-q1", "q-p1-q1"), answer("blk-p2-q1", "q-p2-q1")]
  assert.equal(hasAnsweredAllRequired([PART1, PART2], answers), true)
})

test("часть без обязательных вопросов не считается за 'часть' — с ней всё равно ≤1 реальная часть, OR-поведение сохраняется", () => {
  const answers = [answer("blk-p1-q1", "q-p1-q1")]
  assert.equal(hasAnsweredAllRequired([PART1, NO_REQUIRED], answers), true)
})

test("вообще нет обязательных вопросов ни у одного демо → false", () => {
  assert.equal(hasAnsweredAllRequired([NO_REQUIRED], [answer("blk-p3-q1", "q-p3-q1")]), false)
})

test("нет ответов вообще → false", () => {
  assert.equal(hasAnsweredAllRequired([PART1, PART2], null), false)
})
