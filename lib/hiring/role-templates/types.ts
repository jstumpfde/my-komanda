// Типы шаблона роли (ТЗ №2). Сама таблица — roleTemplates в lib/db/schema.ts.
// Здесь — форма метаданных скоринга и удобный тип строки шаблона для UI/выборок.

import type { CandidateSpec } from "@/lib/core/spec/types"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"

/**
 * Метаданные расчёта финального балла роли (ТЗ §2.5).
 * Анкета — ГЕЙТ (не вес): ниже anketaGate.passingScore кандидат не проходит.
 * Финал считается из голосовых этапов: final = screening*w.screening + interview*w.interview.
 * Фактический расчёт подключается в логике скоринга (ТЗ №3) — здесь только значения.
 */
export interface RoleScoringFormula {
  /** Веса голосовых этапов в финале. Сумма ≈ 1. ТЗ: screening 0.4 / interview 0.6. */
  weights?: { screening: number; interview: number }
  /** Пороги статуса по финальному баллу. ТЗ: ≥80 подходит · ≥review рассмотреть · иначе нет. */
  statuses?: { suitable: number; review: number }
  /** Анкета-гейт: проходной балл (ТЗ: 60). Дублирует spec.anketaThresholds.lowerThreshold. */
  anketaGate?: { passingScore: number }
  /** Человекочитаемая формула для подсказки в UI. */
  note?: string
}

/** Категория роли (для группировки в UI выбора шаблона). */
export type RoleCategory = "sales" | "marketing" | "hr" | "ops" | "support" | "other"

/**
 * Удобная форма строки role_templates для выборок/UI.
 * specTemplate/funnelV2Template — заготовки, разворачиваемые при применении (ТЗ №3).
 */
export interface RoleTemplateRow {
  id: string
  slug: string | null
  name: string
  description: string | null
  roleCategory: string | null
  isSystem: boolean | null
  tenantId: string | null
  questionnaireTemplateId: string | null
  demoTemplateId: string | null
  specTemplate: Partial<CandidateSpec>
  funnelV2Template: FunnelV2Stage[]
  scoringFormula: RoleScoringFormula
  isPublished: boolean | null
  createdAt: Date | null
}
