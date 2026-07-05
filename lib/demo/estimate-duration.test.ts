// Юнит-тесты оценки объёма демо (первый экран, «конверсия демо» 05.07).
// Запуск: pnpm exec tsx --test lib/demo/estimate-duration.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { estimateDemoDuration } from "./estimate-duration"
import type { Block } from "@/lib/course-types"

function block(partial: Partial<Block> & { type: Block["type"] }): Block {
  return {
    id: `blk-${Math.random().toString(36).slice(2, 8)}`,
    content: "",
    imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
    videoUrl: "", videoTitleTop: "", videoCaption: "",
    audioUrl: "", audioTitle: "", audioTitleTop: "", audioCaption: "",
    fileUrl: "", fileName: "", fileTitleTop: "", fileCaption: "",
    infoStyle: "info",
    buttonText: "", buttonUrl: "", buttonVariant: "primary",
    taskTitle: "", taskDescription: "", questions: [],
    ...partial,
  } as Block
}

test("пустой массив блоков — 0 шагов, 0 минут", () => {
  const result = estimateDemoDuration([])
  assert.equal(result.steps, 0)
  assert.equal(result.minutes, 0)
  assert.equal(result.totalSeconds, 0)
})

test("M = число блоков (шагов), независимо от типа", () => {
  const blocks = [
    block({ type: "text", content: "Привет" }),
    block({ type: "image" }),
    block({ type: "button" }),
  ]
  const result = estimateDemoDuration(blocks)
  assert.equal(result.steps, 3)
})

test("текстовый блок — минимум 10с даже для короткого текста", () => {
  const result = estimateDemoDuration([block({ type: "text", content: "Привет!" })])
  assert.ok(result.totalSeconds >= 10)
})

test("длинный текст читается дольше короткого", () => {
  const short = estimateDemoDuration([block({ type: "text", content: "Коротко." })])
  const long = estimateDemoDuration([block({ type: "text", content: "А".repeat(3000) })])
  assert.ok(long.totalSeconds > short.totalSeconds)
})

test("task-блок — 30с на каждый вопрос", () => {
  const result = estimateDemoDuration([
    block({
      type: "task",
      questions: [
        { id: "q1", text: "Вопрос 1", answerType: "short", options: [] },
        { id: "q2", text: "Вопрос 2", answerType: "short", options: [] },
      ],
    }),
  ])
  assert.equal(result.totalSeconds, 60)
})

test("task-блок без вопросов — 15с (просто инфо-экран)", () => {
  const result = estimateDemoDuration([block({ type: "task", questions: [] })])
  assert.equal(result.totalSeconds, 15)
})

test("media-блок использует mediaMaxDuration, если задан", () => {
  const result = estimateDemoDuration([block({ type: "media", mediaMaxDuration: 45 })])
  assert.equal(result.totalSeconds, 45)
})

test("media-блок с неразумно большим лимитом ограничивается потолком", () => {
  const result = estimateDemoDuration([block({ type: "media", mediaMaxDuration: 900 })])
  assert.ok(result.totalSeconds < 900)
  assert.ok(result.totalSeconds <= 300)
})

test("media-блок без лимита — дефолт 60с", () => {
  const result = estimateDemoDuration([block({ type: "media" })])
  assert.equal(result.totalSeconds, 60)
})

test("stories-блок суммирует durationSec карточек", () => {
  const result = estimateDemoDuration([
    block({
      type: "stories",
      storiesCards: [
        { id: "c1", mediaType: "image", url: "x", durationSec: 10 },
        { id: "c2", mediaType: "image", url: "y", durationSec: 20 },
      ],
    }),
  ])
  assert.equal(result.totalSeconds, 30)
})

test("stories-блок без карточек — 0с", () => {
  const result = estimateDemoDuration([block({ type: "stories", storiesCards: [] })])
  assert.equal(result.totalSeconds, 0)
})

test("pdf-блок — 15с на страницу", () => {
  const result = estimateDemoDuration([block({ type: "pdf", pdfPageCount: 4 })])
  assert.equal(result.totalSeconds, 60)
})

test("минуты округляются вверх (61с → 2 минуты)", () => {
  const result = estimateDemoDuration([
    block({ type: "media", mediaMaxDuration: 61 }),
  ])
  assert.equal(result.totalSeconds, 61)
  assert.equal(result.minutes, 2)
})

test("минимум 1 минута, даже если блоки есть, но суммарно меньше 60с", () => {
  const result = estimateDemoDuration([block({ type: "button" })])
  assert.equal(result.minutes, 1)
})

test("реалистичный набор из нескольких блоков даёт разумную непустую оценку", () => {
  const blocks = [
    block({ type: "text", content: "Добро пожаловать в компанию! Это демо расскажет о вакансии." }),
    block({ type: "video" }),
    block({
      type: "task",
      questions: [{ id: "q1", text: "Расскажите о себе", answerType: "long", options: [] }],
    }),
    block({ type: "button" }),
  ]
  const result = estimateDemoDuration(blocks)
  assert.equal(result.steps, 4)
  assert.ok(result.minutes >= 1)
  assert.ok(result.totalSeconds > 0)
})
