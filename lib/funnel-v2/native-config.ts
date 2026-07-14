/**
 * Чистый слой резолва НАТИВНОЙ конфигурации Воронки v2 (без DB-импортов).
 *
 * Принцип: при включённом движке v2 рантайм читает поведенческие настройки из
 * funnelV2.stage1/stage2/communications, а НЕ из Портрета (getSpec). Отсутствие
 * нативного поля → платформенный дефолт (НЕ фоллбэк на Портрет — Портрет уже
 * скопирован в нативные поля один раз при первом открытии, см. prefillNativeFromSpec).
 *
 * Единственный источник истины для дефолтов и маппинга spec→native.
 */

import type { FunnelV2Config, FunnelV2Stage1, FunnelV2Stage2, FunnelV2Communications } from "./types"

// Дефолты Стадии 1 — совпадают со spec-дефолтами Портрета (types.ts:ResumeThresholds).
export const DEFAULT_STAGE1_INVITE_DELAY = 180
export const DEFAULT_STAGE1_OFF_HOURS_DELAY = 15
export const DEFAULT_STAGE1_REJECT_DELAY_MIN = 60
// Дефолты Стадии 2 — совпадают со spec-дефолтами AnketaPassInvite.
export const DEFAULT_STAGE2_PASS_THRESHOLD = 35
export const DEFAULT_STAGE2_AI_EVAL_THRESHOLD = 45
export const DEFAULT_STAGE2_DELAY_SECONDS = 900
export const DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN = 60
// Дефолт «горячего кандидата».
export const DEFAULT_HOT_CANDIDATE_THRESHOLD = 70

export interface EffectiveStage1 {
  inviteDelaySeconds: number
  offHoursEnabled: boolean
  offHoursDelaySeconds: number
  offHoursText: string           // "" → вызывающий берёт дефолт компании
  rejectLetter: string           // "" → вызывающий берёт дефолт вакансии/платформы
  rejectionDelayMinutes: number
}

/** Эффективные значения Стадии 1 (нативные поля + дефолты). */
export function resolveStage1(config: FunnelV2Config): EffectiveStage1 {
  const s = config.stage1 ?? {}
  return {
    inviteDelaySeconds: s.inviteDelaySeconds ?? DEFAULT_STAGE1_INVITE_DELAY,
    offHoursEnabled: s.offHoursEnabled ?? true,
    offHoursDelaySeconds: s.offHoursDelaySeconds ?? DEFAULT_STAGE1_OFF_HOURS_DELAY,
    offHoursText: s.offHoursText ?? "",
    rejectLetter: s.rejectLetter ?? "",
    rejectionDelayMinutes: s.rejectionDelayMinutes ?? DEFAULT_STAGE1_REJECT_DELAY_MIN,
  }
}

// ── Предзаполнение из Портрета (один раз при первом открытии конструктора) ──────
// spec — сырой объект CandidateSpec (any-shape, приходит из /api/core/spec).
// Заполняем ТОЛЬКО отсутствующие блоки (stage1/stage2/communications), уже
// сохранённые не трогаем. Возвращаем { changed, config } — если changed=false,
// вызывающему не нужно персистить.
type SpecLike = Record<string, unknown> | null | undefined
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined)
const text = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)

export function prefillNativeFromSpec(config: FunnelV2Config, spec: SpecLike): { changed: boolean; config: FunnelV2Config } {
  let changed = false
  const next: FunnelV2Config = { ...config }
  const rt = (spec?.resumeThresholds ?? {}) as Record<string, unknown>
  const ap = (spec?.anketaPassInvite ?? null) as Record<string, unknown> | null
  const tg = (spec?.tgCandidateAlerts ?? null) as Record<string, unknown> | null
  const hot = (spec?.hotCandidateAlert ?? null) as Record<string, unknown> | null

  if (!config.stage1) {
    const s1: FunnelV2Stage1 = {
      inviteDelaySeconds: num(rt.inviteDelaySeconds) ?? DEFAULT_STAGE1_INVITE_DELAY,
      offHoursEnabled: bool(rt.offHoursEnabled) ?? true,
      offHoursDelaySeconds: num(rt.offHoursDelaySeconds) ?? DEFAULT_STAGE1_OFF_HOURS_DELAY,
      offHoursText: text(spec?.offHoursLetter) ?? "",
      rejectLetter: text(spec?.rejectLetter) ?? "",
      rejectionDelayMinutes: num(rt.rejectionDelayMinutes) ?? DEFAULT_STAGE1_REJECT_DELAY_MIN,
    }
    next.stage1 = s1
    changed = true
  }

  if (!config.stage2 && ap) {
    const s2: FunnelV2Stage2 = {
      enabled: bool(ap.enabled) ?? false,
      passThreshold: num(ap.passThreshold) ?? DEFAULT_STAGE2_PASS_THRESHOLD,
      aiEvalThreshold: num(ap.aiEvalThreshold) ?? DEFAULT_STAGE2_AI_EVAL_THRESHOLD,
      transferMode: (ap.transferMode === "seamless" || ap.transferMode === "message" || ap.transferMode === "both") ? ap.transferMode : "both",
      contentBlockId: typeof ap.contentBlockId === "string" ? ap.contentBlockId : null,
      passScreenTitle: text(ap.passScreenTitle) ?? "",
      passScreenText: text(ap.passScreenText) ?? "",
      messageText: text(ap.messageText) ?? "",
      delaySeconds: num(ap.delaySeconds) ?? DEFAULT_STAGE2_DELAY_SECONDS,
      failScreenTitle: text(ap.failScreenTitle) ?? "",
      failScreenText: text(ap.failScreenText) ?? "",
      failAction: (ap.failAction === "pending_manual" || ap.failAction === "pending_rejection") ? ap.failAction : "none",
      failRejectDelayMinutes: num(ap.failRejectDelayMinutes) ?? DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN,
    }
    next.stage2 = s2
    changed = true
  }

  if (!config.communications && (tg || hot)) {
    const comms: FunnelV2Communications = {}
    if (tg) comms.tgAlerts = {
      enabled: bool(tg.enabled) ?? false,
      minResumeScore: num(tg.minResumeScore) ?? null,
      minAnswersScore: num(tg.minAnswersScore) ?? null,
      onGatePassed: bool(tg.onGatePassed) ?? true,
    }
    if (hot) comms.hotCandidate = {
      enabled: bool(hot.enabled) ?? false,
      threshold: num(hot.threshold) ?? DEFAULT_HOT_CANDIDATE_THRESHOLD,
      staleAfterHours: num(hot.staleAfterHours) ?? 3,
    }
    next.communications = comms
    changed = true
  }

  return { changed, config: next }
}
