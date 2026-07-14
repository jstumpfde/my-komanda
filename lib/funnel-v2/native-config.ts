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

/**
 * Эффективные значения Стадии 1.
 *
 * Сигнатура симметрична resolveEffectiveAnketaPassInvite / resolveTgAlerts /
 * resolveHotCandidate: принимает spec-источник (Портрет), конфиг и флаг движка.
 * - Движок v2 включён И stage1 сохранён явно (config.stage1 != null) → нативные
 *   поля (+ платформенные дефолты для отсутствующих).
 * - Иначе (движок выключен ИЛИ stage1 ещё НЕ настроен) → эффективные значения
 *   ИЗ ПОРТРЕТА (spec.resumeThresholds / spec.offHoursLetter / spec.rejectLetter),
 *   а не платформенные дефолты. Маппинг идентичен prefillNativeFromSpec.
 */
export function resolveStage1(
  spec: SpecLike,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveStage1 {
  const useNative = runtimeEnabled && config.stage1 != null
  if (useNative) {
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
  // Фоллбэк на Портрет (spec) — маппинг spec→stage1 идентичен prefillNativeFromSpec.
  const rt = (spec?.resumeThresholds ?? {}) as Record<string, unknown>
  return {
    inviteDelaySeconds: num(rt.inviteDelaySeconds) ?? DEFAULT_STAGE1_INVITE_DELAY,
    offHoursEnabled: bool(rt.offHoursEnabled) ?? true,
    offHoursDelaySeconds: num(rt.offHoursDelaySeconds) ?? DEFAULT_STAGE1_OFF_HOURS_DELAY,
    offHoursText: text(spec?.offHoursLetter) ?? "",
    rejectLetter: text(spec?.rejectLetter) ?? "",
    rejectionDelayMinutes: num(rt.rejectionDelayMinutes) ?? DEFAULT_STAGE1_REJECT_DELAY_MIN,
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

// ── Стадия 2: эффективный anketaPassInvite (native при v2, Портрет иначе) ───────
// Возвращаем объект В ФОРМЕ spec.anketaPassInvite, чтобы вызывающие рантайм-места
// (second-demo-invite / demo-route / answer-route) работали без изменения логики.
// Поля, которые нативно НЕ переносятся (advanceToStage / hhAction / inlineContinue /
// passScreenButtonLabel), берём из spec (или дефолты) — модель маршрутизации hh
// остаётся за Портретом.
export interface EffectiveAnketaPassInvite {
  enabled: boolean
  passThreshold: number
  aiEvalThreshold: number
  transferMode: "seamless" | "message" | "both"
  contentBlockId: string | null
  passScreenTitle: string
  passScreenText: string
  passScreenButtonLabel: string
  messageText: string
  delaySeconds: number
  failScreenTitle: string
  failScreenText: string
  failAction: "none" | "pending_manual" | "pending_rejection"
  failRejectDelayMinutes: number
  inlineContinue: boolean
  advanceToStage: string | null
  hhAction: "assessment" | "interview" | "consider" | "invitation" | null
}

export function resolveEffectiveAnketaPassInvite(
  specAp: Record<string, unknown> | null | undefined,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveAnketaPassInvite | null {
  const spec = specAp ?? null
  const useNative = runtimeEnabled && config.stage2 != null
  const s2 = config.stage2 ?? {}
  const specNum = (k: string, d: number): number => (typeof spec?.[k] === "number" ? spec![k] as number : d)
  const specStr = (k: string): string => (typeof spec?.[k] === "string" ? spec![k] as string : "")
  const specHhAction = (spec?.hhAction === "assessment" || spec?.hhAction === "interview" || spec?.hhAction === "consider" || spec?.hhAction === "invitation") ? spec.hhAction : null
  const specAdvance = typeof spec?.advanceToStage === "string" ? spec.advanceToStage : null

  if (!useNative) {
    if (!spec) return null
    return {
      enabled: spec.enabled === true,
      passThreshold: specNum("passThreshold", DEFAULT_STAGE2_PASS_THRESHOLD),
      aiEvalThreshold: specNum("aiEvalThreshold", DEFAULT_STAGE2_AI_EVAL_THRESHOLD),
      transferMode: (spec.transferMode === "seamless" || spec.transferMode === "message" || spec.transferMode === "both") ? spec.transferMode : "both",
      contentBlockId: typeof spec.contentBlockId === "string" ? spec.contentBlockId : null,
      passScreenTitle: specStr("passScreenTitle"),
      passScreenText: specStr("passScreenText"),
      passScreenButtonLabel: specStr("passScreenButtonLabel"),
      messageText: specStr("messageText"),
      delaySeconds: specNum("delaySeconds", DEFAULT_STAGE2_DELAY_SECONDS),
      failScreenTitle: specStr("failScreenTitle"),
      failScreenText: specStr("failScreenText"),
      failAction: (spec.failAction === "pending_manual" || spec.failAction === "pending_rejection") ? spec.failAction : "none",
      failRejectDelayMinutes: specNum("failRejectDelayMinutes", DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN),
      inlineContinue: spec.inlineContinue !== false,
      advanceToStage: specAdvance,
      hhAction: specHhAction,
    }
  }

  // NATIVE (движок v2 включён): поведенческие поля из stage2, маршрутизация hh — из spec.
  return {
    enabled: s2.enabled ?? false,
    passThreshold: s2.passThreshold ?? DEFAULT_STAGE2_PASS_THRESHOLD,
    aiEvalThreshold: s2.aiEvalThreshold ?? DEFAULT_STAGE2_AI_EVAL_THRESHOLD,
    transferMode: s2.transferMode ?? "both",
    contentBlockId: s2.contentBlockId ?? null,
    passScreenTitle: s2.passScreenTitle ?? "",
    passScreenText: s2.passScreenText ?? "",
    passScreenButtonLabel: specStr("passScreenButtonLabel"),
    messageText: s2.messageText ?? "",
    delaySeconds: s2.delaySeconds ?? DEFAULT_STAGE2_DELAY_SECONDS,
    failScreenTitle: s2.failScreenTitle ?? "",
    failScreenText: s2.failScreenText ?? "",
    failAction: s2.failAction ?? "none",
    failRejectDelayMinutes: s2.failRejectDelayMinutes ?? DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN,
    inlineContinue: (s2.transferMode ?? "both") !== "message",
    advanceToStage: specAdvance,
    hhAction: specHhAction,
  }
}

// ── Коммуникации: TG-уведомления и «горячий кандидат» ──────────────────────────
export interface EffectiveTgAlerts { enabled: boolean; minResumeScore: number | null; minAnswersScore: number | null; onGatePassed: boolean }
export interface EffectiveHotCandidate { enabled: boolean; threshold: number; staleAfterHours: number }

export function resolveTgAlerts(
  specTg: Record<string, unknown> | null | undefined,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveTgAlerts | null {
  if (runtimeEnabled && config.communications?.tgAlerts) return config.communications.tgAlerts
  if (!specTg) return null
  return {
    enabled: specTg.enabled === true,
    minResumeScore: typeof specTg.minResumeScore === "number" ? specTg.minResumeScore : null,
    minAnswersScore: typeof specTg.minAnswersScore === "number" ? specTg.minAnswersScore : null,
    onGatePassed: specTg.onGatePassed !== false,
  }
}

export function resolveHotCandidate(
  specHot: Record<string, unknown> | null | undefined,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveHotCandidate | null {
  if (runtimeEnabled && config.communications?.hotCandidate) return config.communications.hotCandidate
  if (!specHot) return null
  return {
    enabled: specHot.enabled === true,
    threshold: typeof specHot.threshold === "number" ? specHot.threshold : DEFAULT_HOT_CANDIDATE_THRESHOLD,
    staleAfterHours: typeof specHot.staleAfterHours === "number" ? specHot.staleAfterHours : 3,
  }
}
