/**
 * Группировка прогресса демо для визуализации в канбан-режиме вакансии.
 *
 * Используется:
 *  - на карточке кандидата — Badge в правом верхнем углу;
 *  - в шапке колонки канбана — мини-срез по группам прогресса.
 *
 * Источник данных — поле demo_progress_json кандидата.
 * Расчёт процента идентичен calcDemoPercent из @/components/hr/demo-progress-bar
 * (который уже используется в HR-003 и других местах).
 */

import { calcDemoPercent, type DemoProgressData } from "@/components/hr/demo-progress-bar"

/** Ключ группы прогресса. */
export type DemoProgressGroupKey = "none" | "low" | "mid" | "high" | "done"

/**
 * Возвращает процент прохождения 0..100, либо 0 если кандидат не приступал.
 * В отличие от calcDemoPercent (где 0 и "не приступал" различимы — null vs 0),
 * для целей бакетинга оба эти случая попадают в группу "none".
 */
export function getDemoProgressPercent(
  demoProgressJson: DemoProgressData | null | undefined,
): number {
  const { percent } = calcDemoPercent(demoProgressJson ?? null)
  return percent ?? 0
}

export interface DemoProgressGroupInfo {
  /** Машинный ключ группы. */
  groupKey: DemoProgressGroupKey
  /** Подпись для UI ("Не начато", "32%" и т.п.). */
  label: string
  /** Tailwind-классы для Badge: фон + текст + рамка. */
  badgeClass: string
  /** Tailwind-класс цвета "точки" для среза в шапке колонки (bg-*). */
  dotColor: string
}

/**
 * Возвращает группу прогресса по проценту.
 *
 * Границы (по ТЗ):
 *  - 0 (или не начато)         → none (серый, "Не начато")
 *  - 1..29                     → low  (красный)
 *  - 30..69                    → mid  (янтарный)
 *  - 70..99                    → high (синий)
 *  - 100                       → done (зелёный)
 */
export function getDemoProgressGroup(percent: number): DemoProgressGroupInfo {
  if (percent <= 0) {
    return {
      groupKey: "none",
      label: "Не начато",
      badgeClass: "bg-muted text-muted-foreground border-border",
      dotColor: "bg-muted-foreground/40",
    }
  }
  if (percent < 30) {
    return {
      groupKey: "low",
      label: `${percent}%`,
      badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
      dotColor: "bg-red-500",
    }
  }
  if (percent < 70) {
    return {
      groupKey: "mid",
      label: `${percent}%`,
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
      dotColor: "bg-amber-500",
    }
  }
  if (percent < 100) {
    return {
      groupKey: "high",
      label: `${percent}%`,
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900",
      dotColor: "bg-blue-500",
    }
  }
  return {
    groupKey: "done",
    label: "100%",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
    dotColor: "bg-emerald-500",
  }
}

/** Порядок групп слева направо для среза в шапке колонки. */
export const DEMO_PROGRESS_GROUP_ORDER: readonly DemoProgressGroupKey[] = [
  "none",
  "low",
  "mid",
  "high",
  "done",
] as const

/** Распределение кандидатов колонки по группам прогресса. */
export type DemoProgressGroupCounts = Record<DemoProgressGroupKey, number>

/**
 * Считает распределение кандидатов по группам прогресса демо.
 * Принимает массив объектов, у которых есть поле demoProgressJson —
 * совместимо с типом Candidate из components/dashboard/candidate-card.
 */
export function groupCandidatesByProgress(
  candidates: ReadonlyArray<{ demoProgressJson?: DemoProgressData | null }>,
): DemoProgressGroupCounts {
  const counts: DemoProgressGroupCounts = { none: 0, low: 0, mid: 0, high: 0, done: 0 }
  for (const c of candidates) {
    const pct = getDemoProgressPercent(c.demoProgressJson ?? null)
    const { groupKey } = getDemoProgressGroup(pct)
    counts[groupKey] += 1
  }
  return counts
}
