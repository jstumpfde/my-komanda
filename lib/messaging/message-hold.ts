// Option 2 (страж сообщений): придержать подозрительное сообщение на проверку HR.
// Когда у компании включён messageGuardHold.enabled и страж нашёл СЕРЬЁЗНУЮ
// проблему (сырая переменная / пустое) — сообщение НЕ отправляется, а кладётся
// в held_messages; HR получает уведомление (in-app + Telegram компании) и решает:
// отправить вручную / отклонить. Тумблер дефолт OFF, владелец компании включает сам.
//
// Вызывается из нижнего уровня отправки (lib/hh-api.ts). companyId необязателен —
// без него hold не срабатывает (graceful). При любой осечке возвращает false
// (лучше отправить очищенное стражем, чем потерять сообщение).

import { db } from "@/lib/db"
import { companies, candidates, heldMessages, hhResponses } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isSerious } from "./guard-alert"
import { createNotification } from "@/lib/notifications"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"

const TTL_MS = 60_000
const holdCache = new Map<string, { enabled: boolean; at: number }>()

async function isHoldEnabled(companyId: string): Promise<boolean> {
  const now = Date.now()
  const c = holdCache.get(companyId)
  if (c && now - c.at < TTL_MS) return c.enabled
  let enabled = false
  try {
    const [row] = await db.select({ d: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, companyId)).limit(1)
    enabled = (row?.d as { messageGuardHold?: { enabled?: boolean } } | null)?.messageGuardHold?.enabled === true
  } catch { /* выкл */ }
  holdCache.set(companyId, { enabled, at: now })
  return enabled
}

/** Возвращает true, если сообщение придержано (НЕ отправлять). */
export async function maybeHoldMessage(args: {
  companyId?: string
  hhResponseId?: string
  text: string
  issues: string[]
  source?: string
}): Promise<boolean> {
  try {
    if (!args.companyId || !args.issues.length || !isSerious(args.issues)) return false
    if (!(await isHoldEnabled(args.companyId))) return false

    // Резолвим кандидата по negotiation (для карточки HR), мягко.
    let candidateId: string | null = null
    if (args.hhResponseId) {
      try {
        const [r] = await db.select({ cid: hhResponses.localCandidateId })
          .from(hhResponses).where(eq(hhResponses.hhResponseId, args.hhResponseId)).limit(1)
        candidateId = r?.cid ?? null
      } catch { /* без кандидата */ }
    }

    const [held] = await db.insert(heldMessages).values({
      companyId:    args.companyId,
      hhResponseId: args.hhResponseId ?? null,
      candidateId,
      messageText:  args.text,
      issues:       args.issues,
      source:       args.source ?? null,
    }).returning({ id: heldMessages.id })

    // Имя кандидата (для уведомления), мягко.
    let candName = ""
    if (candidateId) {
      try {
        const [c] = await db.select({ name: candidates.name }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
        candName = c?.name ? ` (${c.name})` : ""
      } catch { /* без имени */ }
    }

    void createNotification({
      tenantId:   args.companyId,
      type:       "message_held",
      severity:   "warning",
      title:      "Сообщение придержано на проверку",
      body:       `Страж нашёл проблему и не отправил сообщение${candName}. Проверьте и отправьте вручную: ${args.issues.join("; ")}`,
      sourceType: "held_message",
      sourceId:   held?.id,
      href:       "/hr/held-messages",
    }).catch(() => {})

    void sendToCompanyChannel(
      args.companyId,
      `🛑 <b>Сообщение придержано стражем</b>${candName}\nПроблема: ${args.issues.join("; ")}\nПроверьте в разделе «Придержанные сообщения».`,
    ).catch(() => {})

    return true
  } catch (err) {
    console.warn("[message-hold] failed:", err instanceof Error ? err.message : err)
    return false
  }
}
