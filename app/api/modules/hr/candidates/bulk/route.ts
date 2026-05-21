import { NextRequest } from "next/server"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { trySyncRejectToHh } from "@/lib/hh/sync-stage"

const HH_BULK_DELAY_MS = 500

const VALID_STAGES = [
  "new", "primary_contact", "demo", "demo_opened", "decision",
  "anketa_filled", "ai_screening", "interview", "final_decision",
  "hired", "rejected", "talent_pool", "pending", "preboarding",
] as const
type Stage = (typeof VALID_STAGES)[number]

type BulkAction =
  | "reject"
  | "invite"
  | "talent_pool"
  | "set_stage"
  | "toggle_favorite"
  | "restore"

interface StageHistoryEntry {
  from?: string | null
  to?: string
  at?: string
  reason?: string
  movedBy?: string
  byUserId?: string
  comment?: string
}

const RESTORE_FALLBACK_STAGE = "primary_contact"

function computePrevStageForRestore(stageHistory: unknown): string {
  const history = (Array.isArray(stageHistory) ? stageHistory : []) as StageHistoryEntry[]
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    if (entry?.to === "rejected" && typeof entry.from === "string" && entry.from.length > 0) {
      return entry.from
    }
  }
  return RESTORE_FALLBACK_STAGE
}

interface BulkBody {
  candidateIds?: unknown
  action?: unknown
  payload?: { stage?: unknown; reason?: unknown } | undefined
}

const MAX_IDS = 500

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Последовательно синхронизирует отказы с hh.ru.  Делается ПОСЛЕ
// успешного db-апдейта; ошибки логируются, локальный стейдж не откатывается.
// Задержка между запросами — anti-429 (hh ограничивает скорость negotiations).
async function syncBulkRejectToHh(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try { await trySyncRejectToHh(id) } catch (err) {
      console.warn(`[bulk] hh reject sync failed for ${id}:`, err)
    }
    if (HH_BULK_DELAY_MS > 0) await sleep(HH_BULK_DELAY_MS)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as BulkBody

    const ids = Array.isArray(body.candidateIds)
      ? (body.candidateIds.filter((x): x is string => typeof x === "string" && x.length > 0))
      : []
    const action = body.action as BulkAction | undefined

    if (ids.length === 0) return apiError("candidateIds required", 400)
    if (ids.length > MAX_IDS) return apiError(`Too many ids (max ${MAX_IDS})`, 400)
    if (!action) return apiError("action required", 400)

    // Verify all candidates belong to user's company.
    const owned = await db
      .select({
        id: candidates.id,
        stage: candidates.stage,
        isFavorite: candidates.isFavorite,
        stageHistory: candidates.stageHistory,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(inArray(candidates.id, ids), eq(vacancies.companyId, user.companyId)))

    if (owned.length !== ids.length) {
      return apiError("Some candidates not found or not accessible", 404)
    }

    const ownedIds = owned.map((r) => r.id)

    let affected = 0
    const now = new Date()

    switch (action) {
      case "reject": {
        const result = await db.transaction(async (tx) => {
          const upd = await tx
            .update(candidates)
            .set({
              stage: "rejected",
              autoProcessingStopped: true,
              autoProcessingStoppedReason: "manual_rejection",
              autoProcessingStoppedAt: now,
              updatedAt: now,
            })
            .where(inArray(candidates.id, ownedIds))
            .returning({ id: candidates.id })
          return upd.length
        })
        affected = result
        // Sync с hh — fire-and-forget. Не задерживаем HTTP-ответ HR'у.
        void syncBulkRejectToHh(ownedIds)
        break
      }

      case "invite": {
        const result = await db.transaction(async (tx) => {
          const upd = await tx
            .update(candidates)
            .set({ stage: "interview", updatedAt: now })
            .where(inArray(candidates.id, ownedIds))
            .returning({ id: candidates.id })
          return upd.length
        })
        affected = result
        break
      }

      case "talent_pool": {
        const result = await db.transaction(async (tx) => {
          const upd = await tx
            .update(candidates)
            .set({ stage: "talent_pool", updatedAt: now })
            .where(inArray(candidates.id, ownedIds))
            .returning({ id: candidates.id })
          return upd.length
        })
        affected = result
        break
      }

      case "set_stage": {
        const stage = body.payload?.stage as Stage | undefined
        if (!stage || !(VALID_STAGES as readonly string[]).includes(stage)) {
          return apiError(`Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`, 400)
        }
        const stopAuto = stage === "rejected"
        const result = await db.transaction(async (tx) => {
          const upd = await tx
            .update(candidates)
            .set({
              stage,
              updatedAt: now,
              ...(stopAuto
                ? {
                    autoProcessingStopped: true,
                    autoProcessingStoppedReason: "manual_rejection",
                    autoProcessingStoppedAt: now,
                  }
                : {}),
            })
            .where(inArray(candidates.id, ownedIds))
            .returning({ id: candidates.id })
          return upd.length
        })
        affected = result
        if (stage === "rejected") {
          void syncBulkRejectToHh(ownedIds)
        }
        break
      }

      case "restore": {
        // Возврат группы кандидатов из 'rejected'. Принимаем только тех,
        // кто СЕЙЧАС в rejected. Для остальных — 400 (HR не должен случайно
        // переместить активных кандидатов).
        const notRejected = owned.filter((c) => c.stage !== "rejected")
        if (notRejected.length > 0) {
          return apiError(
            `Restore is only valid for candidates in 'rejected' stage (${notRejected.length} candidate(s) are not)`,
            400,
          )
        }
        // Каждому кандидату своя prevStage из его stageHistory.
        // Несколько UPDATE'ов внутри одной транзакции — bulk-restore это
        // дешёвая операция, не нужна оптимизация в один SQL с CASE.
        const result = await db.transaction(async (tx) => {
          let cnt = 0
          for (const c of owned) {
            const prevStage = computePrevStageForRestore(c.stageHistory)
            const history = (Array.isArray(c.stageHistory) ? c.stageHistory : []) as StageHistoryEntry[]
            const restoreEntry: StageHistoryEntry = {
              from:     "rejected",
              to:       prevStage,
              at:       now.toISOString(),
              reason:   "manual_restore",
              byUserId: user.id,
            }
            const upd = await tx
              .update(candidates)
              .set({
                stage:        prevStage,
                stageHistory: [...history, restoreEntry],
                updatedAt:    now,
              })
              .where(eq(candidates.id, c.id))
              .returning({ id: candidates.id })
            cnt += upd.length
          }
          return cnt
        })
        affected = result
        break
      }

      case "toggle_favorite": {
        // Если все выделенные сейчас в избранном — снимаем; иначе ставим у всех.
        const allFavorite = owned.every((r) => r.isFavorite === true)
        const nextValue = !allFavorite
        const result = await db.transaction(async (tx) => {
          const upd = await tx
            .update(candidates)
            .set({ isFavorite: nextValue, updatedAt: now })
            .where(inArray(candidates.id, ownedIds))
            .returning({ id: candidates.id })
          return upd.length
        })
        affected = result
        return apiSuccess({ success: true, affected, isFavorite: nextValue })
      }

      default:
        return apiError(`Unknown action: ${String(action)}`, 400)
    }

    return apiSuccess({ success: true, affected })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
