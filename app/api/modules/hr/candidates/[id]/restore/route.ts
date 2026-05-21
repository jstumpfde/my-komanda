// Возврат кандидата из стадии "rejected" в воронку.
//
// Логика:
//   1. По stage_history находим последний переход на 'rejected' — берём
//      его поле from как стадию возврата (prevStage).
//   2. Если не нашли — fallback на 'primary_contact' (безопасный возврат
//      к началу активной части воронки, не в 'new' чтобы не запускать
//      импорт hh-отклика заново).
//   3. UPDATE: ставим stage = prevStage, добавляем запись в stage_history
//      с reason='manual_restore'.
//
// auto_processing_stopped НЕ трогаем — если HR хочет, чтобы автоматизация
// продолжалась, он должен это сделать отдельным действием. Молчаливо
// перезапускать дожим после ручного возврата опасно.
//
// hh sync не делаем — кандидат уже получил discard через hh API когда
// его отклоняли, возврат в воронку — это исключительно внутреннее
// состояние нашей платформы.

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface StageHistoryEntry {
  from?: string | null
  to?: string
  at?: string
  reason?: string
  movedBy?: string
  byUserId?: string
  comment?: string
}

const FALLBACK_STAGE = "primary_contact"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select({
        id: candidates.id,
        stage: candidates.stage,
        stageHistory: candidates.stageHistory,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Candidate not found", 404)

    if (row.stage !== "rejected") {
      return apiError("Candidate is not in rejected stage", 400)
    }

    const history = (Array.isArray(row.stageHistory) ? row.stageHistory : []) as StageHistoryEntry[]
    // Идём с конца — последний переход в 'rejected' и есть тот,
    // из которого надо возвращаться.
    let prevStage: string = FALLBACK_STAGE
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i]
      if (entry && entry.to === "rejected" && typeof entry.from === "string" && entry.from.length > 0) {
        prevStage = entry.from
        break
      }
    }

    const now = new Date()
    const restoreEntry: StageHistoryEntry = {
      from:     "rejected",
      to:       prevStage,
      at:       now.toISOString(),
      reason:   "manual_restore",
      byUserId: user.id,
    }

    const [updated] = await db
      .update(candidates)
      .set({
        stage:        prevStage,
        stageHistory: [...history, restoreEntry],
        updatedAt:    now,
      })
      .where(eq(candidates.id, id))
      .returning({ id: candidates.id, stage: candidates.stage })

    return apiSuccess({
      id:       updated?.id ?? id,
      stage:    prevStage,
      restored: true,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /api/modules/hr/candidates/[id]/restore]", err)
    return apiError("Internal server error", 500)
  }
}
