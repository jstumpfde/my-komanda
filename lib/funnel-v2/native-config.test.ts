// Юнит-тесты чистого слоя native-config (резолв + предзаполнение из Портрета).
// Запуск: pnpm exec tsx --test lib/funnel-v2/native-config.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  resolveStage1, prefillNativeFromSpec,
  DEFAULT_STAGE1_INVITE_DELAY, DEFAULT_STAGE1_OFF_HOURS_DELAY, DEFAULT_STAGE1_REJECT_DELAY_MIN,
} from "./native-config"
import { normalizeFunnelV2 } from "./types"

test("resolveStage1: пустой конфиг → дефолты", () => {
  const s1 = resolveStage1(normalizeFunnelV2({ enabled: true, stages: [] }))
  assert.equal(s1.inviteDelaySeconds, DEFAULT_STAGE1_INVITE_DELAY)
  assert.equal(s1.offHoursEnabled, true)
  assert.equal(s1.offHoursDelaySeconds, DEFAULT_STAGE1_OFF_HOURS_DELAY)
  assert.equal(s1.offHoursText, "")
  assert.equal(s1.rejectLetter, "")
  assert.equal(s1.rejectionDelayMinutes, DEFAULT_STAGE1_REJECT_DELAY_MIN)
})

test("resolveStage1: нативные значения побеждают дефолты", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage1: { inviteDelaySeconds: 30, offHoursEnabled: false, offHoursText: "ночь", rejectionDelayMinutes: 5 } })
  const s1 = resolveStage1(cfg)
  assert.equal(s1.inviteDelaySeconds, 30)
  assert.equal(s1.offHoursEnabled, false)
  assert.equal(s1.offHoursText, "ночь")
  assert.equal(s1.rejectionDelayMinutes, 5)
})

test("prefillNativeFromSpec: заполняет отсутствующие блоки из Портрета", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [] })
  const spec = {
    resumeThresholds: { inviteDelaySeconds: 45, offHoursEnabled: false, offHoursDelaySeconds: 20, rejectionDelayMinutes: 90 },
    offHoursLetter: "добрый вечер", rejectLetter: "к сожалению",
    anketaPassInvite: { enabled: true, passThreshold: 40, aiEvalThreshold: 50, transferMode: "both", contentBlockId: "b2", messageText: "письмо", delaySeconds: 600, passScreenTitle: "Молодец", passScreenText: "Дальше", failScreenTitle: "", failScreenText: "", failAction: "none", failRejectDelayMinutes: 60 },
    tgCandidateAlerts: { enabled: true, minResumeScore: 70, minAnswersScore: null, onGatePassed: true },
    hotCandidateAlert: { enabled: true, threshold: 80, staleAfterHours: 4 },
  }
  const { changed, config } = prefillNativeFromSpec(cfg, spec)
  assert.equal(changed, true)
  assert.equal(config.stage1?.inviteDelaySeconds, 45)
  assert.equal(config.stage1?.offHoursEnabled, false)
  assert.equal(config.stage1?.offHoursText, "добрый вечер")
  assert.equal(config.stage1?.rejectLetter, "к сожалению")
  assert.equal(config.stage2?.passThreshold, 40)
  assert.equal(config.stage2?.contentBlockId, "b2")
  assert.equal(config.communications?.tgAlerts?.minResumeScore, 70)
  assert.equal(config.communications?.hotCandidate?.threshold, 80)
})

test("prefillNativeFromSpec: не перетирает уже сохранённые нативные блоки", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage1: { inviteDelaySeconds: 15 } })
  const spec = { resumeThresholds: { inviteDelaySeconds: 999 } }
  const { changed, config } = prefillNativeFromSpec(cfg, spec)
  // stage1 уже есть → не трогаем; stage2/communications отсутствуют в spec → без изменений
  assert.equal(config.stage1?.inviteDelaySeconds, 15)
  assert.equal(changed, false)
})
