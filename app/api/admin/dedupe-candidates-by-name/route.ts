// POST /api/admin/dedupe-candidates-by-name
//
// Отчёт о подозрительных «нечётких» дублях кандидатов по имени
// (когда стандартный dedupe по phone/email не сработал — например,
// «Дамёткина Елизавета Дмитриевна» и «Лида Дамёткина»). Только
// platform_admin. Авто-мёрджа НЕТ — это диагностика.
//
// Body (всё опционально):
//   {
//     vacancyId?: string,    // ограничить поиск одной вакансией
//     companyId?: string,    // ограничить компанией
//     threshold?: number,    // Levenshtein distance, default 3
//     minTokenLen?: number,  // минимальная длина слова для индекса, default 4
//     limit?: number,        // max количество пар в ответе, default 500
//   }

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, hhCandidates } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

interface DedupeBody {
  vacancyId?:   unknown
  companyId?:   unknown
  threshold?:   unknown
  minTokenLen?: unknown
  limit?:       unknown
}

interface CandidateMini {
  id:         string
  name:       string
  stage:      string | null
  vacancyId:  string
  createdAt:  string  // ISO
  fromHh:     boolean
}

interface SuspiciousPair {
  candidate_a:    CandidateMini
  candidate_b:    CandidateMini
  name_distance:  number
  shared_tokens:  string[]
  same_vacancy:   boolean
  from_hh:        [boolean, boolean]
  confidence:     "high" | "medium" | "low"
}

// Минимальный Levenshtein на двух строках. Использует одну строку DP-таблицы
// — O(min(a,b)) памяти, O(a*b) время. Имена короткие (<60 символов),
// поэтому ок без оптимизаций.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a)     return b.length
  if (!b)     return a.length
  const m = a.length, n = b.length
  const dp = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
        ? prev
        : Math.min(prev, dp[j], dp[j - 1]) + 1
      prev = tmp
    }
  }
  return dp[n]
}

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9 ]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(normalized: string, minLen: number): string[] {
  return normalized.split(" ").filter(t => t.length >= minLen)
}

function canonicalName(normalized: string): string {
  // Пробуем сделать имя сравнимым независимо от порядка ФИО.
  // Сортируем слова по алфавиту, склеиваем — тогда «иван петров»
  // и «петров иван» дают одинаковую строку.
  return normalized.split(" ").filter(Boolean).sort().join(" ")
}

function classify(distance: number, sharedCount: number, tokenA: number, tokenB: number): "high" | "medium" | "low" {
  // High: либо очень близкие по Levenshtein, либо полностью совпадает
  // более одного значимого слова (фамилия+имя), что для русских ФИО
  // практически гарантирует одного человека.
  if (distance <= 1 || sharedCount >= 2) return "high"
  if (distance <= 2) return "medium"
  // Если кандидат A — короткое имя («Лида Дамёткина», 2 токена) и
  // ровно один токен пересекается с длинным B — это слабый сигнал,
  // но всё-таки сигнал.
  if (sharedCount >= 1 && (tokenA <= 2 || tokenB <= 2)) return "medium"
  return "low"
}

export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin()
    const body = (await req.json().catch(() => ({}))) as DedupeBody

    const vacancyId   = typeof body.vacancyId   === "string"  ? body.vacancyId   : null
    const threshold   = typeof body.threshold   === "number" && body.threshold   >= 0 ? Math.min(10, body.threshold)   : 3
    const minTokenLen = typeof body.minTokenLen === "number" && body.minTokenLen >= 2 ? Math.min(8,  body.minTokenLen) : 4
    const limit       = typeof body.limit       === "number" && body.limit       >= 1 ? Math.min(2000, body.limit)    : 500

    const where = vacancyId ? eq(candidates.vacancyId, vacancyId) : undefined

    const rows = await db
      .select({
        id:           candidates.id,
        name:         candidates.name,
        stage:        candidates.stage,
        vacancyId:    candidates.vacancyId,
        createdAt:    candidates.createdAt,
        hhResumeId:   hhCandidates.hhResumeId,
      })
      .from(candidates)
      .leftJoin(hhCandidates, eq(hhCandidates.candidateId, candidates.id))
      .where(where ?? undefined as never)

    if (rows.length === 0) {
      return apiSuccess({ total_candidates: 0, groups_checked: 0, pairs_compared: 0, suspicious_pairs: [] })
    }

    const items: Array<CandidateMini & { _norm: string; _canon: string; _tokens: Set<string> }> = []
    for (const r of rows) {
      if (!r.name || !r.name.trim()) continue
      const norm = normalizeName(r.name)
      if (!norm) continue
      items.push({
        id:        r.id,
        name:      r.name,
        stage:     r.stage,
        vacancyId: r.vacancyId,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
        fromHh:    !!r.hhResumeId,
        _norm:     norm,
        _canon:    canonicalName(norm),
        _tokens:   new Set(tokens(norm, minTokenLen)),
      })
    }

    // Обратный индекс: token → indexes. Дальше для каждого кандидата
    // проверяем только тех, кто разделяет хотя бы одно длинное слово.
    const byToken = new Map<string, number[]>()
    for (let i = 0; i < items.length; i++) {
      for (const t of items[i]._tokens) {
        let bucket = byToken.get(t)
        if (!bucket) { bucket = []; byToken.set(t, bucket) }
        bucket.push(i)
      }
    }

    const seenPair = new Set<string>()
    const pairs: SuspiciousPair[] = []
    let pairsCompared = 0

    for (let i = 0; i < items.length && pairs.length < limit; i++) {
      const a = items[i]
      // Сосед-кандидаты — те, у кого есть хотя бы один общий длинный
      // токен. Без индекса было бы O(n²); с ним — почти линейно
      // относительно реальных кластеров.
      const neighbors = new Set<number>()
      for (const t of a._tokens) {
        const bucket = byToken.get(t)
        if (!bucket) continue
        for (const j of bucket) {
          if (j > i) neighbors.add(j)
        }
      }

      for (const j of neighbors) {
        const b = items[j]
        const key = `${a.id}|${b.id}`
        if (seenPair.has(key)) continue
        seenPair.add(key)
        pairsCompared++

        const shared: string[] = []
        for (const t of a._tokens) if (b._tokens.has(t)) shared.push(t)

        // Сравниваем по канонической форме (отсортированные слова) —
        // тогда «Дамёткина Лида» и «Лида Дамёткина» дают distance=0.
        const distance = levenshtein(a._canon, b._canon)
        if (distance > threshold) continue

        const conf = classify(distance, shared.length, a._tokens.size, b._tokens.size)

        pairs.push({
          candidate_a: stripInternal(a),
          candidate_b: stripInternal(b),
          name_distance: distance,
          shared_tokens: shared,
          same_vacancy:  a.vacancyId === b.vacancyId,
          from_hh:       [a.fromHh, b.fromHh],
          confidence:    conf,
        })
        if (pairs.length >= limit) break
      }
    }

    // Сортировка: high → medium → low, внутри — по distance asc, потом по
    // числу shared токенов desc.
    const order = { high: 0, medium: 1, low: 2 } as const
    pairs.sort((x, y) => {
      if (order[x.confidence] !== order[y.confidence]) return order[x.confidence] - order[y.confidence]
      if (x.name_distance !== y.name_distance) return x.name_distance - y.name_distance
      return y.shared_tokens.length - x.shared_tokens.length
    })

    return apiSuccess({
      total_candidates: items.length,
      threshold,
      min_token_len:    minTokenLen,
      groups_checked:   byToken.size,
      pairs_compared:   pairsCompared,
      pairs_returned:   pairs.length,
      truncated:        pairs.length >= limit,
      suspicious_pairs: pairs,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[dedupe-by-name]", err)
    return apiError("Internal server error", 500)
  }
}

function stripInternal(it: CandidateMini & { _norm?: unknown; _canon?: unknown; _tokens?: unknown }): CandidateMini {
  const { id, name, stage, vacancyId, createdAt, fromHh } = it
  return { id, name, stage, vacancyId, createdAt, fromHh }
}
