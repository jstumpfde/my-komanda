// Юнит-тесты глубокого копирования с перегенерацией id (course-types.ts:
// cloneQuestionWithNewId/cloneBlockWithNewIds/cloneLessonWithNewIds).
//
// Ключевой инвариант: id вопросов (q-*) участвуют в anketa_answers и скоринге
// (correctOptions/aiCriteria) — коллизия id между оригиналом и копией сломает
// гейт анкеты. Дублирование/копирование блоков и уроков (content-blocks-tab.tsx,
// notion-editor.tsx, app/api/.../content-blocks/copy) ОБЯЗАНО перегенерировать
// id на всех уровнях: урок → блок → вопрос/карточка сторис.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  cloneQuestionWithNewId,
  cloneBlockWithNewIds,
  cloneLessonWithNewIds,
  createBlock,
  defaultQuestion,
} from "./course-types"
import type { Lesson, Block, Question } from "./course-types"

function taskBlockWithQuestions(id: string, questions: Question[]): Block {
  return { ...createBlock("task"), id, questions }
}

test("cloneQuestionWithNewId: новый id, контент 1-в-1, оригинал не мутирован", () => {
  const orig: Question = {
    ...defaultQuestion(),
    id: "q-orig-1",
    text: "Сколько лет опыта в продажах?",
    answerType: "single",
    options: ["0-1", "1-3", "3+"],
    correctOptions: [2],
    points: 5,
    aiCriteria: "Ищем релевантный опыт",
  }
  const copy = cloneQuestionWithNewId(orig)

  assert.notEqual(copy.id, orig.id)
  assert.match(copy.id, /^q-/)
  assert.equal(copy.text, orig.text)
  assert.deepEqual(copy.options, orig.options)
  assert.deepEqual(copy.correctOptions, orig.correctOptions)
  assert.equal(copy.points, orig.points)
  assert.equal(copy.aiCriteria, orig.aiCriteria)

  // Мутация копии не должна задеть оригинал (глубокая копия, не ссылка)
  copy.options.push("мутация")
  assert.equal(orig.options.length, 3)
})

test("cloneBlockWithNewIds: новый id блока + новые id ВСЕХ вопросов внутри", () => {
  const q1 = { ...defaultQuestion(), id: "q-a", text: "Вопрос 1" }
  const q2 = { ...defaultQuestion(), id: "q-b", text: "Вопрос 2", answerType: "single" as const, options: ["Да", "Нет"], correctOptions: [0] }
  const orig = taskBlockWithQuestions("blk-orig", [q1, q2])

  const copy = cloneBlockWithNewIds(orig)

  assert.notEqual(copy.id, orig.id)
  assert.match(copy.id, /^blk-/)
  assert.equal(copy.questions.length, 2)
  // Каждый id вопроса в копии новый и НЕ совпадает ни с одним оригинальным id
  const origIds = new Set([q1.id, q2.id])
  for (const q of copy.questions) {
    assert.match(q.id, /^q-/)
    assert.ok(!origIds.has(q.id), `id вопроса ${q.id} коллизирует с оригиналом`)
  }
  // Содержимое (текст/варианты/правильные ответы) сохранено 1-в-1
  assert.equal(copy.questions[0].text, "Вопрос 1")
  assert.equal(copy.questions[1].text, "Вопрос 2")
  assert.deepEqual(copy.questions[1].options, ["Да", "Нет"])
  assert.deepEqual(copy.questions[1].correctOptions, [0])

  // Оригинал не мутирован
  assert.equal(orig.id, "blk-orig")
  assert.equal(orig.questions[0].id, "q-a")
  assert.equal(orig.questions[1].id, "q-b")
})

test("cloneBlockWithNewIds: перегенерирует id карточек сторис", () => {
  const orig: Block = {
    ...createBlock("stories"),
    id: "blk-stories-1",
    storiesCards: [
      { id: "card-1", mediaType: "image", url: "https://x/1.jpg" },
      { id: "card-2", mediaType: "video", url: "https://x/2.mp4" },
    ],
  }
  const copy = cloneBlockWithNewIds(orig)
  assert.equal(copy.storiesCards?.length, 2)
  assert.notEqual(copy.storiesCards?.[0].id, "card-1")
  assert.notEqual(copy.storiesCards?.[1].id, "card-2")
  assert.equal(copy.storiesCards?.[0].url, "https://x/1.jpg")
  assert.equal(orig.storiesCards?.[0].id, "card-1") // оригинал цел
})

test("cloneLessonWithNewIds: новый id урока + новые id блоков и вопросов, дефолтный суффикс «(копия)»", () => {
  const lesson: Lesson = {
    id: "les-orig",
    emoji: "✅",
    title: "Задания и вопросы",
    blocks: [
      taskBlockWithQuestions("blk-1", [{ ...defaultQuestion(), id: "q-1", text: "Опыт?" }]),
    ],
  }
  const copy = cloneLessonWithNewIds(lesson)

  assert.notEqual(copy.id, lesson.id)
  assert.match(copy.id, /^les-/)
  assert.equal(copy.title, "Задания и вопросы (копия)")
  assert.equal(copy.emoji, "✅")
  assert.notEqual(copy.blocks[0].id, "blk-1")
  assert.notEqual(copy.blocks[0].questions[0].id, "q-1")
  assert.equal(copy.blocks[0].questions[0].text, "Опыт?")

  // Оригинал не мутирован
  assert.equal(lesson.id, "les-orig")
  assert.equal(lesson.blocks[0].id, "blk-1")
  assert.equal(lesson.blocks[0].questions[0].id, "q-1")
})

test("cloneLessonWithNewIds: пустой titleSuffix (копирование между блоками/вакансиями) не трогает заголовок", () => {
  const lesson: Lesson = { id: "les-x", emoji: "🎥", title: "Демо путь менеджера", blocks: [] }
  const copy = cloneLessonWithNewIds(lesson, "")
  assert.equal(copy.title, "Демо путь менеджера")
  assert.notEqual(copy.id, lesson.id)
})

test("cloneLessonWithNewIds: две копии подряд НЕ коллизируют друг с другом", () => {
  const lesson: Lesson = {
    id: "les-src",
    emoji: "📋",
    title: "Урок",
    blocks: [taskBlockWithQuestions("blk-s", [{ ...defaultQuestion(), id: "q-s" }])],
  }
  const copyA = cloneLessonWithNewIds(lesson)
  const copyB = cloneLessonWithNewIds(lesson)

  assert.notEqual(copyA.id, copyB.id)
  assert.notEqual(copyA.blocks[0].id, copyB.blocks[0].id)
  assert.notEqual(copyA.blocks[0].questions[0].id, copyB.blocks[0].questions[0].id)
})

test("дублирование блока целиком (несколько уроков) — все id на всех уровнях уникальны в пределах копии", () => {
  const lessons: Lesson[] = [
    { id: "les-1", emoji: "👋", title: "Приветствие", blocks: [{ ...createBlock("text"), id: "blk-t1", content: "Привет" }] },
    { id: "les-2", emoji: "✅", title: "Вопросы", blocks: [taskBlockWithQuestions("blk-t2", [
      { ...defaultQuestion(), id: "q-x1" },
      { ...defaultQuestion(), id: "q-x2" },
    ])] },
  ]
  const cloned = lessons.map((l) => cloneLessonWithNewIds(l, ""))

  const allIds = [
    ...cloned.map((l) => l.id),
    ...cloned.flatMap((l) => l.blocks.map((b) => b.id)),
    ...cloned.flatMap((l) => l.blocks.flatMap((b) => b.questions.map((q) => q.id))),
  ]
  assert.equal(new Set(allIds).size, allIds.length, "id должны быть уникальны внутри копии блока")

  // Ни один id копии не совпадает с оригинальными id источника
  const origIds = new Set([
    ...lessons.map((l) => l.id),
    ...lessons.flatMap((l) => l.blocks.map((b) => b.id)),
    ...lessons.flatMap((l) => l.blocks.flatMap((b) => b.questions.map((q) => q.id))),
  ])
  for (const id of allIds) assert.ok(!origIds.has(id))
})
