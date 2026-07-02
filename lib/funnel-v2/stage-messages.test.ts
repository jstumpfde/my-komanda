// Юнит-тесты эффективного текста «приглашения» стадии (Воронка 3, fix мёртвого
// поля «Приглашение»: рантайм читает stage.messages, а не только messagePresetId).
// Запуск: pnpm exec tsx --test lib/funnel-v2/stage-messages.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { effectiveStageMessageText, stageMessages } from "./types"

test("messages задан → уходит именно он (messagePresetId игнорируется)", () => {
  const stage = { messages: ["Привет, {{name}}!"], messagePresetId: "старый устаревший текст" }
  assert.equal(effectiveStageMessageText(stage), "Привет, {{name}}!")
})

test("messages нет → fallback на устаревший messagePresetId", () => {
  const stage = { messagePresetId: "Текст из старого поля" }
  assert.equal(effectiveStageMessageText(stage), "Текст из старого поля")
})

test("несколько сообщений → join через пустую строку (досыла в executor нет — одна отправка)", () => {
  const stage = { messages: ["Первое.", "Второе: {{demo_link}}"] }
  assert.equal(effectiveStageMessageText(stage), "Первое.\n\nВторое: {{demo_link}}")
})

test("пустые/пробельные сообщения отбрасываются", () => {
  assert.equal(effectiveStageMessageText({ messages: ["  ", "Текст", ""] }), "Текст")
  assert.equal(effectiveStageMessageText({ messages: ["  ", ""] }), "")
})

test("ничего не задано → пустая строка (executor берёт свой дефолт)", () => {
  assert.equal(effectiveStageMessageText({}), "")
  assert.equal(effectiveStageMessageText({ messagePresetId: null }), "")
})

test("согласованность со stageMessages (тот же эффективный список)", () => {
  const both = { messages: ["a", "b"], messagePresetId: "legacy" }
  assert.deepEqual(stageMessages(both), ["a", "b"])
  const legacyOnly = { messagePresetId: "legacy" }
  assert.deepEqual(stageMessages(legacyOnly), ["legacy"])
})
