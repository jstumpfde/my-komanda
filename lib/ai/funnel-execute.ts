// Фаза 2b «бот ведёт» — РУКИ. Исполняет решение движка (funnel-decision) реальными
// действиями воронки. Срабатывает ТОЛЬКО когда HR явно включил autonomy.* у
// вакансии — иначе движок вернёт "none" и сюда не дойдёт. Дополнительно здесь
// двойная защита: повторно сверяемся с конфигом перед каждым живым действием.
//
// Реализованы безопасные, идемпотентные действия (у обеих функций свой дедуп):
//   request_anketa → trySyncInviteToHh (отправка демо/анкеты в hh-чат)
//   send_test      → scheduleTestInvitesForCandidates (постановка теста в очередь)
// clarify/advance/none — живых действий не делают (clarify = бот уже ответил).
// Интервью — НИКОГДА (жёсткое правило).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { trySyncInviteToHh } from "@/lib/hh/sync-stage"
import { scheduleTestInvitesForCandidates } from "@/lib/messaging/test-invite"
import type { FunnelAction } from "@/lib/ai/funnel-decision"
import type { AutonomySettings } from "@/lib/ai/chatbot-processor"

export interface FunnelExecuteResult {
  executed: boolean
  detail:   string
}

// Повторная сверка с конфигом автономности вакансии (defense-in-depth: даже если
// решение как-то просочилось, без явного тумблера живое действие не выполнится).
async function autonomyAllows(vacancyId: string, action: FunnelAction): Promise<boolean> {
  const [v] = await db
    .select({ settings: vacancies.aiChatbotSettings })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  const a = ((v?.settings as { autonomy?: AutonomySettings } | null)?.autonomy) ?? {}
  if (!a.enabled) return false
  if (action === "request_anketa") return a.canRequestAnketa === true
  if (action === "send_test")      return a.canSendTest === true
  if (action === "advance")        return a.canAdvanceStage === true
  return false
}

export async function executeFunnelAction(
  action: FunnelAction,
  ctx: { candidateId: string; vacancyId: string },
): Promise<FunnelExecuteResult> {
  // Живые действия — только request_anketa / send_test. Остальное без эффекта.
  if (action !== "request_anketa" && action !== "send_test") {
    return { executed: false, detail: "no_live_action" }
  }
  if (!(await autonomyAllows(ctx.vacancyId, action))) {
    return { executed: false, detail: "autonomy_off" }
  }

  try {
    if (action === "request_anketa") {
      const ok = await trySyncInviteToHh(ctx.candidateId)
      console.log("[funnel-execute] request_anketa", JSON.stringify({ ...ctx, ok }))
      return { executed: ok, detail: ok ? "invite_sent" : "invite_failed" }
    }
    // send_test
    const r = await scheduleTestInvitesForCandidates({
      vacancyId: ctx.vacancyId, candidateIds: [ctx.candidateId],
    })
    const executed = (r.scheduled ?? 0) > 0
    console.log("[funnel-execute] send_test", JSON.stringify({ ...ctx, scheduled: r.scheduled, already: r.alreadyQueued }))
    return { executed, detail: executed ? "test_scheduled" : (r.alreadyQueued ? "already_queued" : "test_skipped") }
  } catch (err) {
    console.warn("[funnel-execute] failed:", err instanceof Error ? err.message : err)
    return { executed: false, detail: "error" }
  }
}
