/**
 * Пер-блочный гейтинг (Вариант Б, легаси-мост, решение Юрия 01.07).
 *
 * После завершения контент-блока кандидатом: считаем балл блока (AI + объективный
 * по correctOptions) и, если у блока ВКЛЮЧЁН гейт и балл ниже порога — планируем
 * отказ (тем же путём, что v2/legacy: pendingRejectionAt → cron/pending-rejections).
 *
 * Конфиг гейта — в demos.postDemoSettings.blockGate КАЖДОГО блока:
 *   { enabled, aiThreshold?, objThreshold?, rejectDelayMin?, rejectText? }
 * ДЕФОЛТ — ВЫКЛ (enabled=false): без явной настройки HR никто не отсеивается
 * (безопасно на выкате). Механизмы независимы: можно гейтить по AI, по правильным
 * ответам, или по обоим (не прошёл хотя бы один включённый порог → отказ).
 *
 * Fire-and-forget из demo answer route при isComplete. Идемпотентно: гварды не
 * дают повторно/лишний раз отказать.
 */

import { and, eq, like, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, demos } from "@/lib/db/schema"
import { scoreDemoAnswers } from "@/lib/demo/score-answers"
import { computeBlockObjectiveScores } from "@/lib/demo/objective-gate"

interface BlockGateConfig {
  enabled?: boolean
  aiThreshold?: number      // порог AI-балла блока (0..100). Не задан → по AI не гейтим.
  objThreshold?: number     // порог объективного балла блока (0..100). Не задан → не гейтим.
  rejectDelayMin?: number   // задержка отказа, мин. Дефолт 60.
  rejectText?: string       // текст отказа (иначе generic вакансии).
}

const DEFAULT_REJECT_DELAY_MIN = 60

export async function maybeGateBlocks(candidateId: string, vacancyId: string): Promise<void> {
  // 1) Свежие AI-баллы по блокам (пишет demo_block_scores). Ждём, чтобы не гонки.
  await scoreDemoAnswers({ candidateId, vacancyId, skipIfScored: false }).catch(() => {})
  // 2) Объективные баллы по блокам (детерминированно, correctOptions).
  const objByDemo: Record<string, { score: number }> = await computeBlockObjectiveScores(candidateId, vacancyId).catch(() => ({}))

  // 3) Текущее состояние кандидата + конфиг гейта каждого блока.
  const [cand] = await db
    .select({
      stage:              candidates.stage,
      pendingRejectionAt: candidates.pendingRejectionAt,
      demoBlockScores:    candidates.demoBlockScores,
    })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.vacancyId, vacancyId)))
    .limit(1)
  if (!cand) return
  // Гварды: уже отклонён / уже запланирован отказ — ничего не делаем.
  if (cand.stage === "rejected" || cand.pendingRejectionAt) return

  const blockRows = await db
    .select({ id: demos.id, title: demos.title, postDemoSettings: demos.postDemoSettings })
    .from(demos)
    .where(and(
      eq(demos.vacancyId, vacancyId),
      or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
    ))
    .orderBy(demos.sortOrder, demos.createdAt)

  const aiScores = (cand.demoBlockScores as Record<string, { score?: number }> | null) ?? {}

  // 4) Ищем ПЕРВЫЙ блок, где кандидат не прошёл включённый гейт.
  for (const block of blockRows) {
    const cfg = ((block.postDemoSettings as Record<string, unknown> | null)?.blockGate) as BlockGateConfig | undefined
    if (!cfg?.enabled) continue

    const aiScore = aiScores[block.id]?.score
    const objScore = objByDemo[block.id]?.score

    // Балл ещё не посчитан для блока (кандидат его не проходил) — не гейтим.
    const aiFail  = typeof cfg.aiThreshold === "number"  && typeof aiScore === "number"  && aiScore  < cfg.aiThreshold
    const objFail = typeof cfg.objThreshold === "number" && typeof objScore === "number" && objScore < cfg.objThreshold

    if (aiFail || objFail) {
      const now = new Date()
      const delayMin = typeof cfg.rejectDelayMin === "number" ? Math.max(0, cfg.rejectDelayMin) : DEFAULT_REJECT_DELAY_MIN
      const pendingAt = new Date(now.getTime() + delayMin * 60_000)
      await db.update(candidates).set({
        pendingRejectionAt:     pendingAt,
        pendingRejectionReason: `block_gate:${block.id}`,
        pendingRejectionSetAt:  now,
        updatedAt:              now,
      }).where(eq(candidates.id, candidateId))
      console.log("[block-gate]", JSON.stringify({
        tag: "block-gate/rejection-scheduled", candidateId, blockId: block.id,
        title: block.title, aiScore, objScore, aiThreshold: cfg.aiThreshold, objThreshold: cfg.objThreshold,
        pendingAt: pendingAt.toISOString(),
      }))
      return // один отказ — достаточно
    }
  }
}
