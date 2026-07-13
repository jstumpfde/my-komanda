// Критерии "кандидата-призрака" — пустой заглушки candidates, созданной
// анонимным визитом /api/public/demo/[token]/visit без реального заполнения
// (боты/краулеры разворачивающие ссылку в превью, случайные заходы, staff
// preview без сессии). См. CLAUDE.md / инцидент 13.07 — 35 таких строк
// вычищено вручную на проде перед тем, как эта логика была добавлена.
//
// ВАЖНО: staff-preview визиты теперь не создают кандидатов вовсе (см.
// lib/public/staff-preview.ts + app/api/public/demo/[token]/visit/route.ts),
// поэтому этот крон — предохранитель для остального мусора (боты, брошенные
// визиты без staff-сессии), а не основной механизм.
//
// Используется:
//  - app/api/cron/ghost-candidate-cleanup/route.ts — как SQL WHERE (см. там)
//    + повторная проверка каждой найденной строки этой чистой функцией
//    (защита в глубину на случай дрейфа SQL-условия).

export const GHOST_CANDIDATE_NAME = "Новый кандидат"
export const GHOST_STAGE = "new"
export const GHOST_MIN_AGE_HOURS = 24

export interface GhostCandidateRow {
  name: string | null
  source: string | null
  stage: string | null
  resumeScore: number | null
  phone: string | null
  email: string | null
  demoProgressJson: unknown
  createdAt: Date | string | null
}

// demo_progress_json пуст: NULL, распарсенный {} (drizzle отдаёт jsonb уже
// объектом) либо сырые строки "null"/"{}" (на случай сырого SQL-результата).
function isEmptyDemoProgress(json: unknown): boolean {
  if (json === null || json === undefined) return true
  if (typeof json === "string") return json === "null" || json === "{}"
  if (typeof json === "object") return Object.keys(json as Record<string, unknown>).length === 0
  return false
}

export function isGhostCandidate(row: GhostCandidateRow, now: Date = new Date()): boolean {
  if (row.name !== GHOST_CANDIDATE_NAME) return false
  if (!row.source || !row.source.includes("referral")) return false
  if (row.stage !== GHOST_STAGE) return false
  if (row.resumeScore !== null && row.resumeScore !== undefined) return false
  if (row.phone !== null && row.phone !== undefined) return false
  if (row.email !== null && row.email !== undefined) return false
  if (!isEmptyDemoProgress(row.demoProgressJson)) return false
  if (!row.createdAt) return false

  const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  if (Number.isNaN(createdAt.getTime())) return false
  const ageMs = now.getTime() - createdAt.getTime()
  if (ageMs < GHOST_MIN_AGE_HOURS * 3600_000) return false

  return true
}
