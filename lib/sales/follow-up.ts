// Дожим лидов продаж — кто поговорил с ботом, но НЕ записался.
//
// Логика:
//   1. Выбрать диалоги: status='active', bookedAt IS NULL, lastMessageAt IS NOT NULL.
//   2. Сгруппировать по tenantId; для тенанта загрузить конфиг и настройки follow-up.
//   3. Для каждого диалога проверить, пора ли дожимать (порог времени, maxTouches, TTL 14 дней).
//   4. Отправить шаблонное сообщение через sendToConversation.
//   5. Обновить followupCount / lastFollowupAt.

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesConversations } from "@/lib/db/schema"
import { getSalesBotConfig } from "@/lib/sales/bot-config"
import { resolveSalesChatbotSettings } from "@/lib/ai/sales-chatbot-settings"
import { sendToConversation, type Conversation } from "@/lib/sales/conversations"

// ─── Тексты дожима (без LLM, шаблоны) ───────────────────────────────────────

// Первое касание — мягкий, дружелюбный.
const TEXT_FIRST_TOUCH =
  "Здравствуйте! Вы интересовались записью — подсказать свободное время?"

// Второе и последующие касания — напоминание.
const TEXT_REPEAT_TOUCH =
  "Напомню о себе 🙂 Если удобно — подберу время для записи. На какой день ориентироваться?"

// Диалог считается «протухшим» и не дожимается, если с последнего сообщения
// прошло более 14 дней.
const MAX_STALE_DAYS = 14
const MAX_STALE_MS = MAX_STALE_DAYS * 24 * 60 * 60 * 1000

// ─── Основная функция ─────────────────────────────────────────────────────────

export async function runSalesFollowUp(): Promise<{ checked: number; sent: number }> {
  const now = new Date()

  // 1. Загружаем кандидатов на дожим: активные диалоги без брони, у которых есть
  //    хотя бы одно сообщение. Дальнейшая фильтрация — по порогу времени.
  const conversations = await db
    .select()
    .from(salesConversations)
    .where(
      and(
        eq(salesConversations.status, "active"),
        isNull(salesConversations.bookedAt),
        isNotNull(salesConversations.lastMessageAt),
      ),
    )

  let checked = 0
  let sent = 0

  // 2. Группируем по tenantId, чтобы загружать конфиг один раз на тенант.
  const byTenant = new Map<string, Conversation[]>()
  for (const conv of conversations) {
    const list = byTenant.get(conv.tenantId) ?? []
    list.push(conv)
    byTenant.set(conv.tenantId, list)
  }

  for (const [tenantId, convList] of byTenant) {
    // Загружаем конфиг тенанта и резолвим настройки.
    const botConfig = await getSalesBotConfig(tenantId)
    const settings = resolveSalesChatbotSettings(
      (botConfig?.settings as Parameters<typeof resolveSalesChatbotSettings>[0]) ?? null,
    )
    const { followUp } = settings

    // Если дожим отключён — пропускаем весь тенант.
    if (!followUp.enabled) continue

    const { firstTouchMinutes, secondTouchHours, maxTouches } = followUp
    const firstTouchMs = firstTouchMinutes * 60 * 1000
    const secondTouchMs = secondTouchHours * 60 * 60 * 1000

    for (const conv of convList) {
      checked++

      // Диалог без сообщений — пропускаем (lastMessageAt гарантирован фильтром выше,
      // но TypeScript не знает, что значение не null после isNotNull).
      if (!conv.lastMessageAt) continue

      const lastMsgMs = now.getTime() - conv.lastMessageAt.getTime()

      // Протухший диалог — не трогаем.
      if (lastMsgMs > MAX_STALE_MS) continue

      const followupCount = conv.followupCount ?? 0

      // Достигнут лимит касаний.
      if (followupCount >= maxTouches) continue

      // Проверяем порог времени.
      if (followupCount === 0) {
        // Первое касание: ждём firstTouchMinutes минут с lastMessageAt.
        if (lastMsgMs < firstTouchMs) continue
      } else {
        // Второе и последующие: ждём secondTouchHours часов с lastFollowupAt.
        if (!conv.lastFollowupAt) continue
        const sinceLastFollowup = now.getTime() - conv.lastFollowupAt.getTime()
        if (sinceLastFollowup < secondTouchMs) continue
      }

      // Формируем текст (два шаблона достаточно, для >2 — повтор второго).
      const text = followupCount === 0 ? TEXT_FIRST_TOUCH : TEXT_REPEAT_TOUCH

      // Отправляем; один сбой не роняет весь прогон.
      try {
        const result = await sendToConversation(conv, {
          to: conv.externalUserId,
          text,
          parseMode: "plain",
        })

        if (result.ok) {
          // Обновляем счётчики дожима.
          await db
            .update(salesConversations)
            .set({
              followupCount: sql`${salesConversations.followupCount} + 1`,
              lastFollowupAt: now,
              updatedAt: now,
            })
            .where(eq(salesConversations.id, conv.id))
          sent++
        }
      } catch (err) {
        console.error(
          `[sales/follow-up] conv=${conv.id} tenant=${tenantId} error:`,
          err instanceof Error ? err.message : String(err),
        )
      }
    }
  }

  return { checked, sent }
}
