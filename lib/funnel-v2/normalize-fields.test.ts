// Регресс-тест: normalizeFunnelV2 НЕ теряет поля стадии при чтении из БД.
// Гард для добавленных полей (hhStatus — Q1, dozhimChainOpened — Q3, 26.06).
// Запуск: pnpm exec tsx --test lib/funnel-v2/normalize-fields.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeFunnelV2 } from "./types"
import type { FunnelV2Stage } from "./types"

const raw = {
  enabled: true,
  stages: [
    {
      id: "st-demo",
      action: "demo",
      messagePresetId: "Здравствуйте, {{name}}!",
      hhStatus: "первичный контакт",
      rule: { autoAdvance: true, autoReject: false, rejectDelayMinutes: 60 },
      dozhim: "standard",
      dozhimChain: [{ text: "не открыл — касание 1", delayDays: 1 }],
      dozhimChainOpened: [{ text: "открыл, не досмотрел — касание 1", delayDays: 1 }],
    },
  ],
}

test("normalizeFunnelV2 сохраняет hhStatus, dozhimChain и dozhimChainOpened", () => {
  const cfg = normalizeFunnelV2(raw)
  const st = cfg.stages[0] as FunnelV2Stage
  assert.equal(st.hhStatus, "первичный контакт")
  assert.equal(st.messagePresetId, "Здравствуйте, {{name}}!")
  assert.deepEqual(st.dozhimChain, [{ text: "не открыл — касание 1", delayDays: 1 }])
  assert.deepEqual(st.dozhimChainOpened, [{ text: "открыл, не досмотрел — касание 1", delayDays: 1 }])
})

test("normalizeFunnelV2 терпим к битым данным (не падает, выкидывает стадии без id)", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [{ action: "demo" }, null, "мусор"] })
  assert.equal(cfg.stages.length, 0)
})

test("normalizeFunnelV2 нормализует невалидный dozhim к standard", () => {
  const cfg = normalizeFunnelV2({
    enabled: true,
    stages: [{ id: "x", action: "message", rule: {}, dozhim: "не-пресет" }],
  })
  assert.equal(cfg.stages[0].dozhim, "standard")
})
