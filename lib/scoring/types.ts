// Чистые типы и константы движка скоринга — БЕЗ серверных импортов (fs, SDK),
// чтобы их можно было импортировать в клиентские компоненты.

export type WeightLevel = "critical" | "important" | "nice" | "irrelevant"

// Веса критериев. «Критично» весит втрое против «желательно», «не важно» = 0.
export const WEIGHT_VALUES: Record<WeightLevel, number> = {
  critical: 3, important: 2, nice: 1, irrelevant: 0,
}
export const WEIGHT_LABELS: Record<WeightLevel, string> = {
  critical: "Критично", important: "Важно", nice: "Желательно", irrelevant: "Не важно",
}

export interface Criterion {
  key: string
  label: string
  weight: WeightLevel
  hint?: string   // что именно проверять — уходит в промпт
}

export interface ScoringSpec {
  vacancyTitle: string
  positionSummary: string        // сжатые обязанности + требования
  requiredSkills: string[]
  niceSkills?: string[]
  idealProfile?: string          // «описание идеального кандидата» из анкеты
  minExperienceYears?: number
  salaryFrom?: number
  salaryTo?: number
  location?: string
  workFormat?: string
  knockouts?: string[]           // жёсткие стоп-факторы → verdict reject, балл 0
  screeningQuestions?: string[]  // HR-вопросы для отсева — контекст для оценки, не баллы
  criteria: Criterion[]
}

export type Confidence = "low" | "medium" | "high"
export type Verdict = "strong" | "maybe" | "weak" | "reject"

export interface CriterionResult {
  key: string
  label: string
  weight: WeightLevel
  score: number          // 0-100 от модели
  evidence: string       // цитата/перефраз из резюме или «нет данных»
  confidence: Confidence
}

export interface RubricResult {
  total: number          // 0-100 взвешенный (считается кодом)
  verdict: Verdict
  knockoutHit: string | null
  criteria: CriterionResult[]
  summary: string
  model: string
  cache: { creationTokens: number; readTokens: number }  // диагностика prompt-кэша
}
