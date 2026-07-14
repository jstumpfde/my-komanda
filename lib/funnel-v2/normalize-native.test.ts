// Юнит-тесты нормализации нативных полей funnelV2 (stage1/stage2/communications).
// Запуск: pnpm exec tsx --test lib/funnel-v2/normalize-native.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeFunnelV2 } from "./types"

test("stage1/stage2/communications отсутствуют → остаются undefined (легаси-конфиг)", () => {
  const c = normalizeFunnelV2({ enabled: true, stages: [] })
  assert.equal(c.stage1, undefined)
  assert.equal(c.stage2, undefined)
  assert.equal(c.communications, undefined)
})

test("stage1 нормализуется: валидные поля проходят, мусор отбрасывается", () => {
  const c = normalizeFunnelV2({
    enabled: true, stages: [],
    stage1: { inviteDelaySeconds: 60, offHoursEnabled: false, offHoursDelaySeconds: 30, offHoursText: "вечер", rejectLetter: "отказ", rejectionDelayMinutes: 120, bogus: 1 },
  })
  assert.deepEqual(c.stage1, { inviteDelaySeconds: 60, offHoursEnabled: false, offHoursDelaySeconds: 30, offHoursText: "вечер", rejectLetter: "отказ", rejectionDelayMinutes: 120 })
})

test("stage2 нормализуется и клампит пороги 0..100", () => {
  const c = normalizeFunnelV2({
    enabled: true, stages: [],
    stage2: { enabled: true, passThreshold: 150, aiEvalThreshold: -5, transferMode: "seamless", contentBlockId: "b1", messageText: "m", delaySeconds: 900, failAction: "pending_rejection", failRejectDelayMinutes: 60 },
  })
  assert.equal(c.stage2?.passThreshold, 100)
  assert.equal(c.stage2?.aiEvalThreshold, 0)
  assert.equal(c.stage2?.transferMode, "seamless")
  assert.equal(c.stage2?.contentBlockId, "b1")
  assert.equal(c.stage2?.failAction, "pending_rejection")
})

test("communications нормализуется", () => {
  const c = normalizeFunnelV2({
    enabled: true, stages: [],
    communications: {
      tgAlerts: { enabled: true, minResumeScore: 70, minAnswersScore: null, onGatePassed: true },
      hotCandidate: { enabled: true, threshold: 80, staleAfterHours: 4 },
    },
  })
  assert.equal(c.communications?.tgAlerts?.enabled, true)
  assert.equal(c.communications?.tgAlerts?.minResumeScore, 70)
  assert.equal(c.communications?.hotCandidate?.threshold, 80)
})
