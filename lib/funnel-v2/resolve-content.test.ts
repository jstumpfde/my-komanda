// Юнит-тесты чистой логики разрешения контентного блока стадии (Фаза 0).
// Запуск: pnpm exec tsx --test lib/funnel-v2/resolve-content.test.ts
//
// Тестируем только findStageContentBlockId — чистую функцию без IO.
// resolveCurrentStageContent (заглушка с throw) — не тестируем (реализация Фаза 1).

import { test } from "node:test"
import assert from "node:assert/strict"
import { findStageContentBlockId } from "./resolve-content"
import type { FunnelV2Config } from "./types"

// ── Фикстура ──────────────────────────────────────────────────────────────────

function makeConfig(): FunnelV2Config {
  return {
    enabled: true,
    stages: [
      {
        id: "st-msg",
        action: "message",
        contentBlockId: null,          // без блока
        rule: { autoAdvance: true, autoReject: false, rejectDelayMinutes: 60 },
        dozhim: "off",
      },
      {
        id: "st-demo",
        action: "demo",
        contentBlockId: "block-abc123", // есть блок
        rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 },
        dozhim: "standard",
      },
      {
        id: "st-test",
        action: "test",
        contentBlockId: "block-xyz456", // есть блок
        rule: { autoAdvance: false, autoReject: true, threshold: 70, rejectDelayMinutes: 120 },
        dozhim: "soft",
      },
      {
        id: "st-no-block",
        action: "interview",
        // contentBlockId вообще не задан (undefined)
        rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 },
        dozhim: "off",
      },
    ],
  }
}

// ── Стадия со строковым contentBlockId ───────────────────────────────────────

test("stageId существует и contentBlockId задан → возвращает contentBlockId", () => {
  const cfg = makeConfig()
  assert.equal(findStageContentBlockId(cfg, "st-demo"), "block-abc123")
  assert.equal(findStageContentBlockId(cfg, "st-test"), "block-xyz456")
})

// ── contentBlockId = null → null ──────────────────────────────────────────────

test("stageId существует но contentBlockId=null → null", () => {
  const cfg = makeConfig()
  assert.equal(findStageContentBlockId(cfg, "st-msg"), null)
})

// ── contentBlockId не задан (undefined) → null ───────────────────────────────

test("stageId существует но contentBlockId не задан (undefined) → null", () => {
  const cfg = makeConfig()
  assert.equal(findStageContentBlockId(cfg, "st-no-block"), null)
})

// ── stageId не найден → null ─────────────────────────────────────────────────

test("stageId не найден в stages → null", () => {
  const cfg = makeConfig()
  assert.equal(findStageContentBlockId(cfg, "st-nonexistent"), null)
})

// ── Пустой список стадий → null ──────────────────────────────────────────────

test("пустой массив stages → null", () => {
  const cfg: FunnelV2Config = { enabled: true, stages: [] }
  assert.equal(findStageContentBlockId(cfg, "st-demo"), null)
})

// ── enabled=false не влияет на поиск ─────────────────────────────────────────

test("enabled=false → поиск всё равно работает (флаг не влияет на lookup)", () => {
  const cfg = makeConfig()
  cfg.enabled = false
  assert.equal(findStageContentBlockId(cfg, "st-demo"), "block-abc123")
})
