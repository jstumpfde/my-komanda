// Юнит-тесты адаптера рантайма воронки (Phase 3). node:test (как template-renderer).
// Запуск: pnpm exec tsx --test lib/funnel-builder/runtime.test.ts
//
// Критично: адаптер обслуживает живой рантайм найма. Фиксируем главную гарантию —
// при выключенном флаге поведение РОВНО равно legacyValue, и только при включённом
// флаге + наличии блока источником становится block.enabled.

import { test } from "node:test"
import assert from "node:assert/strict"
import { isBlockEnabled, isFunnelRuntimeActive } from "./runtime"

const cfg = (blocks: Array<{ type: string; enabled: boolean }>) => ({
  blocks: blocks.map((b, i) => ({ type: b.type, order: i + 1, enabled: b.enabled })),
})

// ── Флаг ВЫКЛЮЧЕН (по умолчанию все вакансии) → возвращаем legacyValue как есть ──
test("флаг off → legacyValue=true возвращается true (даже если блок выключен в конфиге)", () => {
  const v = { funnelRuntimeEnabled: false, funnelConfigJson: cfg([{ type: "ai_chatbot", enabled: false }]) }
  assert.equal(isBlockEnabled(v, "ai_chatbot", true), true)
})

test("флаг off → legacyValue=false возвращается false (даже если блок включён в конфиге)", () => {
  const v = { funnelRuntimeEnabled: false, funnelConfigJson: cfg([{ type: "ai_chatbot", enabled: true }]) }
  assert.equal(isBlockEnabled(v, "ai_chatbot", false), false)
})

// ── Флаг ВКЛЮЧЁН → источник истины block.enabled ──
test("флаг on + блок enabled:true → true (перекрывает legacy=false)", () => {
  const v = { funnelRuntimeEnabled: true, funnelConfigJson: cfg([{ type: "ai_chatbot", enabled: true }]) }
  assert.equal(isBlockEnabled(v, "ai_chatbot", false), true)
})

test("флаг on + блок enabled:false → false (перекрывает legacy=true) — кейс расхождения полигона", () => {
  const v = { funnelRuntimeEnabled: true, funnelConfigJson: cfg([{ type: "ai_chatbot", enabled: false }]) }
  assert.equal(isBlockEnabled(v, "ai_chatbot", true), false)
})

// ── Флаг ВКЛЮЧЁН, но блока нет / конфиг пуст → fallback на legacyValue ──
test("флаг on + блок отсутствует в конфиге → fallback на legacyValue", () => {
  const v = { funnelRuntimeEnabled: true, funnelConfigJson: cfg([{ type: "first_message", enabled: true }]) }
  assert.equal(isBlockEnabled(v, "ai_chatbot", true), true)
  assert.equal(isBlockEnabled(v, "ai_chatbot", false), false)
})

test("флаг on + пустой/битый конфиг → fallback на legacyValue", () => {
  assert.equal(isBlockEnabled({ funnelRuntimeEnabled: true, funnelConfigJson: { blocks: [] } }, "ai_chatbot", true), true)
  assert.equal(isBlockEnabled({ funnelRuntimeEnabled: true, funnelConfigJson: null }, "ai_chatbot", true), true)
  assert.equal(isBlockEnabled({ funnelRuntimeEnabled: true }, "ai_chatbot", false), false)
})

// ── Граничные: null/undefined вакансия ──
test("null/undefined вакансия → legacyValue", () => {
  assert.equal(isBlockEnabled(null, "ai_chatbot", true), true)
  assert.equal(isBlockEnabled(undefined, "stop_words_chat", false), false)
})

// ── isFunnelRuntimeActive ──
test("isFunnelRuntimeActive: только явный true активен", () => {
  assert.equal(isFunnelRuntimeActive({ funnelRuntimeEnabled: true }), true)
  assert.equal(isFunnelRuntimeActive({ funnelRuntimeEnabled: false }), false)
  assert.equal(isFunnelRuntimeActive({}), false)
  assert.equal(isFunnelRuntimeActive(null), false)
})
