// Общие типы трекера продуктивности.

// Содержательность задачи/дня: пустяк / норма / крупная.
export type Substance = "trivial" | "normal" | "substantial"

// Вердикт дня относительно скользящей нормы.
//   silence — нет работы (0 коммитов)
//   below   — заметно ниже типичного рабочего дня
//   normal  — в пределах нормы
//   above   — заметно выше нормы
//   warmup  — мало истории, норму ещё не на чем считать
export type Verdict = "silence" | "below" | "normal" | "above" | "warmup"

// ── Сырьё сбора (git по SSH) ──────────────────────────────────────────────
export interface RawCommit {
  sha:     string
  day:     string   // YYYY-MM-DD (МСК)
  at:      string   // ISO-время коммита (с tz сервера)
  subject: string
  added:   number
  removed: number
  files:   number
}

// Элемент ленты «что катит сейчас» — последние коммиты за ~2 суток.
export interface RecentCommit {
  at:      string   // ISO-время
  repo:    string   // ярлык проекта
  subject: string
  added:   number
  removed: number
}

export interface RepoSnapshot {
  key:      string
  label:    string
  path:     string
  remote:   string | null
  branch:   string | null
  wipFiles: number   // незакоммиченные файлы на момент сбора
  unpushed: number   // коммиты впереди upstream
  commits:  RawCommit[]
}

export interface CollectResult {
  person:      string
  collectedAt: string
  repos:       RepoSnapshot[]
}

// ── Разбор дня (Claude) ───────────────────────────────────────────────────
export interface DayTask {
  repo:  string   // ярлык проекта
  title: string   // что сделано, человеческим языком
  kind:  Substance
}

export interface DaySummary {
  summary:   string      // абзац-журнал за день
  tasks:     DayTask[]
  taskCount: number      // число осмысленных задач
  substance: Substance   // общий тон дня
}

// ── Агрегат для UI/БД ─────────────────────────────────────────────────────
export interface RepoDayStat {
  repo:    string
  commits: number
  added:   number
  removed: number
}

export interface DevActivityDay {
  day:          string
  commitCount:  number
  linesAdded:   number
  linesRemoved: number
  wipFiles:     number
  workMinutes:  number
  taskCount:    number
  score:        number
  substance:    Substance | null
  verdict:      Verdict | null
  baseline:     number | null
  summary:      string | null
  tasks:        DayTask[]
  repos:        RepoDayStat[]
}
