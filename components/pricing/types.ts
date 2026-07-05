// Общие типы модуля «Мониторинг цен» — контракт зафиксирован в
// docs/architecture/PRICE-MONITOR-2026-07.md, API пишется параллельно.

export interface PriceMonitorObject {
  id: string
  name: string
  source: string
  externalId: string | null
  url: string
  complexName: string | null
  isActive: boolean
  lastCheckedAt: string | null
  competitorsCount: number
  latestOwnPerNight: number | null
  currency: string | null
}

export interface EffectiveSettings {
  radiusM: number
  periods: number[]
  intervalMinutes: number
  runAtTime: string
  currency: string
  autoDiscover: boolean
  complexFilter: string | null
}

export interface CompanySettings {
  radiusM: number
  periods: number[]
  intervalMinutes: number
  runAtTime: string
  currency: string
  isDefault?: boolean
}

export interface ObjectDetail {
  id: string
  name: string
  source: string
  externalId: string | null
  url: string
  complexName: string | null
  isActive: boolean
  lastCheckedAt: string | null
  settingsJson?: {
    radiusM?: number
    periods?: number[]
    leadDays?: number
    complexFilter?: string | null
    schedule?: { intervalMinutes?: number | null; runAtTime?: string | null }
    autoDiscover?: boolean
  } | null
}

export interface RunResult {
  ownSnapshots: number
  competitorsSeen: number
  competitorsNew: number
  competitorSnapshots: number
  errors: string[]
}

export interface ComparisonPriceCell {
  total: number | null
  perNight: number | null
  available: boolean
}

export interface ComparisonRow {
  kind: "own" | "competitor"
  competitorId: string | null
  name: string
  url: string
  distanceM: number | null
  isIgnored: boolean
  prices: Record<string, ComparisonPriceCell>
}

export interface ComparisonData {
  capturedAt: string
  captures: string[]
  currency: string
  periods: number[]
  rows: ComparisonRow[]
  medians: Record<string, number | null>
  deltas: Record<string, number | null>
}

export interface Competitor {
  id: string
  url: string
  name: string
  isIgnored: boolean
}
