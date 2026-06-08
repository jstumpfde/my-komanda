// Исполнитель автоматизаций воронки продаж.
//
// Правила хранятся в sales_settings.automations (вкладка «Автоматизации»).
// Триггер — переход сделки на стадию. Вызывается из PUT /api/modules/sales/deals/[id],
// когда стадия реально изменилась.
//
// Действия:
//   - create_task     → задача в sales_tasks, привязанная к сделке
//   - notify_manager  → задача «связаться» (высокий приоритет)
//   - send_message    → сообщение клиенту в привязанный диалог бота
//   - start_followup  → реактивировать диалог для крона дожима (sales-follow-up)
//
// Диалог сделки определяется по sales_conversations.dealId; если не привязан явно —
// fallback по общему contactId сделки и диалога.

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesSettings, salesTasks, salesDeals, salesConversations } from "@/lib/db/schema"
import { sendToConversation, type Conversation } from "@/lib/sales/conversations"

interface AutomationRule {
  id?: string
  enabled?: boolean
  stageId?: string
  action?: "notify_manager" | "create_task" | "start_followup" | "send_message"
  params?: { text?: string }
}

// Найти диалог клиента для сделки: сначала по прямой привязке dealId,
// затем (fallback) по общему contactId. Возвращает самый свежий.
async function resolveDealConversation(
  tenantId: string,
  dealId: string,
  contactId: string | null,
): Promise<Conversation | null> {
  const [byDeal] = await db
    .select()
    .from(salesConversations)
    .where(and(eq(salesConversations.tenantId, tenantId), eq(salesConversations.dealId, dealId)))
    .orderBy(desc(salesConversations.lastMessageAt))
    .limit(1)
  if (byDeal) return byDeal

  if (contactId) {
    const [byContact] = await db
      .select()
      .from(salesConversations)
      .where(and(eq(salesConversations.tenantId, tenantId), eq(salesConversations.contactId, contactId)))
      .orderBy(desc(salesConversations.lastMessageAt))
      .limit(1)
    if (byContact) return byContact
  }
  return null
}

// Выполнить автоматизации для перехода сделки на стадию newStageId.
// Не бросает наружу — ошибки логируются, основной поток не ломаем.
export async function runStageAutomations(
  tenantId: string,
  dealId: string,
  newStageId: string,
): Promise<void> {
  try {
    const [settings] = await db
      .select({ automations: salesSettings.automations })
      .from(salesSettings)
      .where(eq(salesSettings.tenantId, tenantId))
      .limit(1)

    const rules = (settings?.automations as AutomationRule[] | null) ?? []
    const matched = rules.filter((r) => r && r.enabled !== false && r.stageId === newStageId && r.action)
    if (matched.length === 0) return

    const [deal] = await db
      .select({ title: salesDeals.title, contactId: salesDeals.contactId })
      .from(salesDeals)
      .where(eq(salesDeals.id, dealId))
      .limit(1)
    const dealTitle = deal?.title ?? "сделка"
    const contactId = deal?.contactId ?? null

    // Диалог резолвим лениво — только если есть действие, которому он нужен.
    let conversation: Conversation | null | undefined = undefined
    const getConversation = async () => {
      if (conversation === undefined) conversation = await resolveDealConversation(tenantId, dealId, contactId)
      return conversation
    }

    for (const rule of matched) {
      try {
        if (rule.action === "create_task" || rule.action === "notify_manager") {
          const isNotify = rule.action === "notify_manager"
          const title = rule.params?.text?.trim()
            || (isNotify ? `Связаться по сделке: ${dealTitle}` : `Задача по сделке: ${dealTitle}`)
          await db.insert(salesTasks).values({
            tenantId,
            title,
            dealId,
            priority: isNotify ? "high" : "medium",
            description: "Автоматически создано при переходе сделки на стадию.",
          })
        } else if (rule.action === "send_message") {
          const text = rule.params?.text?.trim()
          if (!text) { console.warn("[sales:automations] send_message без текста — пропуск"); continue }
          const conv = await getConversation()
          if (!conv) { console.warn(`[sales:automations] send_message: у сделки ${dealId} нет привязанного диалога`); continue }
          await sendToConversation(conv, { to: conv.externalUserId, text, parseMode: "plain" }, { role: "manager" })
        } else if (rule.action === "start_followup") {
          const conv = await getConversation()
          if (!conv) { console.warn(`[sales:automations] start_followup: у сделки ${dealId} нет привязанного диалога`); continue }
          // Реактивируем диалог для крона дожима: активен + сброс счётчиков касаний.
          await db
            .update(salesConversations)
            .set({ status: "active", followupCount: 0, lastFollowupAt: null, updatedAt: new Date() })
            .where(eq(salesConversations.id, conv.id))
        }
      } catch (err) {
        console.error("[sales:automations] правило не выполнено:", rule.action, err)
      }
    }
  } catch (err) {
    console.error("[sales:automations] runStageAutomations failed:", err)
  }
}
