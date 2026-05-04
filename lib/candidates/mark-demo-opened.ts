// Хелпер для фиксации первого открытия демо-страницы кандидатом.
// Вызывается из /api/public/demo/[token]/visit при cookie==owner или при
// первом визите без cookie (см. routes/visit).
//
// Эффекты:
//   1. Если кандидат в primary_contact / new — переводим в demo_opened.
//   2. Заполняем demo_opened_at (если ещё пусто) — служит признаком
//      «кандидат хотя бы раз открыл страницу» вне зависимости от стейджа.
//   3. Дописываем запись в stageHistory.
//   4. Шаг 5 (две ветки дожима) добавит сюда переключение ветки А → Б.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { switchToBranchOpened } from "@/lib/followup/switch-branch"

interface StageHistoryEntry {
  from:   string
  to:     string
  at:     string
  reason: string
}

const STAGES_THAT_TRANSITION_TO_OPENED = new Set([
  "new",
  "primary_contact",
  // 'demo' — legacy ключ, тоже считаем как «не открывал», потому что точная
  // история не сохранилась.
  "demo",
])

export async function markDemoOpened(candidateId: string): Promise<void> {
  const [cand] = await db
    .select({
      stage:        candidates.stage,
      demoOpenedAt: candidates.demoOpenedAt,
      stageHistory: candidates.stageHistory,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!cand) return

  const now = new Date()
  const updates: Record<string, unknown> = { updatedAt: now }
  let changed = false

  if (!cand.demoOpenedAt) {
    updates.demoOpenedAt = now
    changed = true
  }

  if (cand.stage && STAGES_THAT_TRANSITION_TO_OPENED.has(cand.stage)) {
    const fromStage = cand.stage
    updates.stage = "demo_opened"
    const history = (cand.stageHistory as StageHistoryEntry[] | null) ?? []
    updates.stageHistory = [
      ...history,
      { from: fromStage, to: "demo_opened", at: now.toISOString(), reason: "demo_page_visited" },
    ]
    changed = true
  }

  if (!changed) return

  try {
    await db.update(candidates).set(updates).where(eq(candidates.id, candidateId))
  } catch (err) {
    console.error("[markDemoOpened] failed:", err instanceof Error ? err.message : err)
    return
  }

  // Переключение ветки дожима А → Б (fire-and-forget — не блокируем
  // редирект кандидата, ошибки логируем).
  void switchToBranchOpened(candidateId).catch((err) => {
    console.error("[markDemoOpened] switchToBranchOpened failed:",
      err instanceof Error ? err.message : err)
  })
}
