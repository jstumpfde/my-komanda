// Оценка продуктивности дня и сравнение со скользящей нормой.
//
// Принцип: мерим НЕ коммиты и НЕ строки (их легко накрутить AI-кодингом), а
// число осмысленных задач, взвешенное по содержательности. Норма — это
// типичный РАБОЧИЙ день самого человека (медиана ненулевых дней за окно), а не
// абстрактный план. Тихий день (0) — отдельный вердикт, он не топит норму.

import type { Substance, Verdict } from "./types"

// Вес задачи по содержательности. Крупная стоит как ~три рядовых, пустяк —
// почти ноль (чтобы «причесал отступы ×5» не выглядело как продуктивный день).
export const KIND_WEIGHT: Record<Substance, number> = {
  trivial:     0.3,
  normal:      1,
  substantial: 3,
}

// Окно для расчёта нормы и минимум статистики, ниже которого вердикт = warmup.
export const BASELINE_WINDOW_DAYS = 28
export const MIN_HISTORY_DAYS     = 5

// Пороги отклонения от нормы.
export const BELOW_RATIO = 0.5   // < 50% типичного дня → ниже нормы
export const ABOVE_RATIO = 1.5   // > 150% типичного дня → выше нормы

export function scoreTasks(tasks: Array<{ kind: Substance }>): number {
  const sum = tasks.reduce((s, t) => s + (KIND_WEIGHT[t.kind] ?? KIND_WEIGHT.normal), 0)
  return Math.round(sum * 100) / 100
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function verdictFor(score: number, baseline: number | null): Verdict {
  if (baseline === null) return "warmup"
  if (score <= 0) return "silence"
  if (score < BELOW_RATIO * baseline) return "below"
  if (score > ABOVE_RATIO * baseline) return "above"
  return "normal"
}

export interface SeriesPoint { day: string; score: number }
export interface SeriesVerdict { day: string; baseline: number | null; verdict: Verdict }

// Прогоняет ряд дней по порядку и для каждого считает норму по ПРЕДЫДУЩИМ
// ненулевым дням внутри окна. Это единственный источник правды по вердиктам —
// и сборщик, и API считают так же.
export function computeSeries(points: SeriesPoint[]): SeriesVerdict[] {
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day))
  const out: SeriesVerdict[] = []

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const windowStart = dayOffset(cur.day, -BASELINE_WINDOW_DAYS)
    const priorNonZero = sorted
      .slice(0, i)
      .filter(p => p.day >= windowStart && p.score > 0)
      .map(p => p.score)

    const baseline = priorNonZero.length >= MIN_HISTORY_DAYS ? median(priorNonZero) : null
    out.push({ day: cur.day, baseline, verdict: verdictFor(cur.score, baseline) })
  }
  return out
}

// YYYY-MM-DD ± дни (UTC-арифметика, дат без времени достаточно).
export function dayOffset(day: string, deltaDays: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

// Оценка отработанного времени по таймстампам коммитов (эвристика git-hours):
// внутри сессии складываем промежутки между коммитами; разрыв больше порога =
// новая сессия со «временем на разгон» до её первого коммита.
// ЭТО ОЦЕНКА ПО КОММИТАМ, не табель: при редких коммитах занижает.
export const MAX_SESSION_GAP_MIN = 120  // разрыв > 2ч = новая сессия
export const SESSION_LEAD_MIN     = 60  // время «до первого коммита» в сессии

export function estimateWorkMinutes(isoTimes: string[]): number {
  const ts = isoTimes
    .map(t => new Date(t).getTime())
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (ts.length === 0) return 0
  let total = SESSION_LEAD_MIN
  for (let i = 1; i < ts.length; i++) {
    const gap = (ts[i] - ts[i - 1]) / 60000
    total += gap <= MAX_SESSION_GAP_MIN ? gap : SESSION_LEAD_MIN
  }
  return Math.round(total)
}
