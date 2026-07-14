// Юнит-тесты чистого слоя native-config (резолв + предзаполнение из Портрета).
// Запуск: pnpm exec tsx --test lib/funnel-v2/native-config.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  resolveStage1, prefillNativeFromSpec,
  DEFAULT_STAGE1_INVITE_DELAY, DEFAULT_STAGE1_OFF_HOURS_DELAY, DEFAULT_STAGE1_REJECT_DELAY_MIN,
} from "./native-config"
import { normalizeFunnelV2 } from "./types"

// Портрет-источник для фоллбэка (resolveStage1 читает resumeThresholds +
// offHoursLetter/rejectLetter — маппинг идентичен prefillNativeFromSpec).
const SPEC_STAGE1 = {
  resumeThresholds: { inviteDelaySeconds: 45, offHoursEnabled: false, offHoursDelaySeconds: 20, rejectionDelayMinutes: 300 },
  offHoursLetter: "добрый вечер",
  rejectLetter: "к сожалению",
}

test("resolveStage1: движок включён, stage1 нет, spec нет → дефолты платформы", () => {
  const s1 = resolveStage1(null, normalizeFunnelV2({ enabled: true, stages: [] }), true)
  assert.equal(s1.inviteDelaySeconds, DEFAULT_STAGE1_INVITE_DELAY)
  assert.equal(s1.offHoursEnabled, true)
  assert.equal(s1.offHoursDelaySeconds, DEFAULT_STAGE1_OFF_HOURS_DELAY)
  assert.equal(s1.offHoursText, "")
  assert.equal(s1.rejectLetter, "")
  assert.equal(s1.rejectionDelayMinutes, DEFAULT_STAGE1_REJECT_DELAY_MIN)
})

test("resolveStage1: движок включён + stage1 сохранён → нативные значения (Портрет игнор)", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage1: { inviteDelaySeconds: 30, offHoursEnabled: true, offHoursText: "ночь", rejectionDelayMinutes: 5 } })
  const s1 = resolveStage1(SPEC_STAGE1, cfg, true)
  assert.equal(s1.inviteDelaySeconds, 30)
  assert.equal(s1.offHoursEnabled, true)          // native, не Портрет false
  assert.equal(s1.offHoursText, "ночь")
  assert.equal(s1.rejectionDelayMinutes, 5)        // native, не Портрет 300
})

test("resolveStage1: движок включён, но stage1 нет → Портрет (обратная совместимость)", () => {
  // Симметрия со stage2: если нативный блок не сохранён — эффективные значения
  // из Портрета (spec), НЕ платформенные дефолты. Закрывает находки 1/2:
  // offHoursEnabled и rejectionDelayMinutes корректно берутся из Портрета.
  const cfg = normalizeFunnelV2({ enabled: true, stages: [] })
  const s1 = resolveStage1(SPEC_STAGE1, cfg, true)
  assert.equal(s1.inviteDelaySeconds, 45)
  assert.equal(s1.offHoursEnabled, false)          // из Портрета (находка 1)
  assert.equal(s1.offHoursDelaySeconds, 20)
  assert.equal(s1.offHoursText, "добрый вечер")
  assert.equal(s1.rejectLetter, "к сожалению")
  assert.equal(s1.rejectionDelayMinutes, 300)      // из Портрета, НЕ дефолт 60 (находка 2)
})

test("resolveStage1: движок выключен → Портрет (даже если stage1 сохранён нативно)", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage1: { offHoursEnabled: true, rejectionDelayMinutes: 5, offHoursText: "native" } })
  const s1 = resolveStage1(SPEC_STAGE1, cfg, false)
  assert.equal(s1.offHoursEnabled, false)          // из Портрета, не native true
  assert.equal(s1.rejectionDelayMinutes, 300)      // из Портрета, не native 5
  assert.equal(s1.offHoursText, "добрый вечер")    // из Портрета, не "native"
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

import { resolveEffectiveAnketaPassInvite, resolveTgAlerts, resolveHotCandidate } from "./native-config"

const SPEC_AP = { enabled: true, passThreshold: 40, aiEvalThreshold: 55, transferMode: "message", contentBlockId: "sb", messageText: "spec-msg", delaySeconds: 300, passScreenTitle: "s-pass", passScreenText: "s-passtext", failScreenTitle: "s-fail", failScreenText: "s-failtext", failAction: "pending_rejection", failRejectDelayMinutes: 30, inlineContinue: false, passScreenButtonLabel: "→", advanceToStage: null, hhAction: null }

test("resolveEffectiveAnketaPassInvite: движок выключен → берём Портрет как есть", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage2: { enabled: true, passThreshold: 10 } })
  const eff = resolveEffectiveAnketaPassInvite(SPEC_AP, cfg, false)
  assert.equal(eff?.passThreshold, 40) // из spec, не из native
})

test("resolveEffectiveAnketaPassInvite: движок включён + есть stage2 → native", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage2: { enabled: true, passThreshold: 10, aiEvalThreshold: 20, transferMode: "seamless", contentBlockId: "nb", messageText: "n-msg", delaySeconds: 60, failAction: "none", failRejectDelayMinutes: 15 } })
  const eff = resolveEffectiveAnketaPassInvite(SPEC_AP, cfg, true)
  assert.equal(eff?.passThreshold, 10)
  assert.equal(eff?.transferMode, "seamless")
  assert.equal(eff?.contentBlockId, "nb")
  assert.equal(eff?.messageText, "n-msg")
  assert.equal(eff?.failAction, "none")
})

test("resolveEffectiveAnketaPassInvite: движок включён, но stage2 нет → Портрет (обратная совместимость)", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [] })
  const eff = resolveEffectiveAnketaPassInvite(SPEC_AP, cfg, true)
  assert.equal(eff?.passThreshold, 40)
})

test("resolveTgAlerts / resolveHotCandidate: native при v2, spec иначе", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], communications: { tgAlerts: { enabled: true, minResumeScore: 88, minAnswersScore: null, onGatePassed: false }, hotCandidate: { enabled: true, threshold: 90, staleAfterHours: 5 } } })
  const specTg = { enabled: false, minResumeScore: 10, minAnswersScore: 20, onGatePassed: true }
  const specHot = { enabled: false, threshold: 60, staleAfterHours: 2 }
  assert.equal(resolveTgAlerts(specTg, cfg, true)?.minResumeScore, 88)
  assert.equal(resolveTgAlerts(specTg, cfg, false)?.minResumeScore, 10)
  assert.equal(resolveHotCandidate(specHot, cfg, true)?.threshold, 90)
  assert.equal(resolveHotCandidate(specHot, cfg, false)?.threshold, 60)
})
