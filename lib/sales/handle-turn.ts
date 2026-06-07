// Обработка одного хода диалога: загрузить конфиг бота + историю, прогнать через
// процессор-«мозг», применить тайминги и отправить ответ (или передать человеку).
//
// Вызывается из webhook ФОНОМ (без await), чтобы Telegram получал быстрый 200,
// а генерация ответа + задержки считались уже после ответа на вебхук.
//
// ВАЖНО (ограничение MVP): фоновая обработка живёт в памяти Node-процесса. При
// рестарте процесса незавершённые ходы теряются. Для надёжности позже — очередь/
// cron, который дочищает неотвеченные входящие (как scan-incoming в HR).

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesMessages } from "@/lib/db/schema"
import { processSalesMessage } from "@/lib/ai/sales-chatbot-processor"
import { getSalesBotConfig } from "./bot-config"
import { sendToConversation, pauseForHuman, recordMessage, type Conversation } from "./conversations"
import { buildServiceContext } from "./service-context"
import { resolveSalesChatbotSettings, type SalesChatbotSettings } from "@/lib/ai/sales-chatbot-settings"
import { extractBookingConfirmation } from "./booking-extraction"
import { createBookingFromExtraction } from "./create-booking"

// Кап на каждую задержку, чтобы один диалог не висел вечно.
const SLEEP_CAP_MS = 60_000
const HISTORY_LIMIT = 8

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.min(Math.max(ms, 0), SLEEP_CAP_MS)))
}

// Недавняя история диалога для контекста, в формате процессора.
// Исключаем только что записанное входящее (оно придёт отдельно как incomingText).
async function getRecentHistory(
  conversationId: string,
  currentText: string,
): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
  const rows = await db
    .select({ direction: salesMessages.direction, text: salesMessages.text })
    .from(salesMessages)
    .where(eq(salesMessages.conversationId, conversationId))
    .orderBy(desc(salesMessages.createdAt))
    .limit(HISTORY_LIMIT + 1)

  const chrono = rows.reverse().map((r) => ({
    role: (r.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
    text: r.text,
  }))

  // Снять хвостовое входящее, совпадающее с текущим сообщением.
  if (chrono.length && chrono[chrono.length - 1].role === "user" && chrono[chrono.length - 1].text === currentText) {
    chrono.pop()
  }
  return chrono
}

export async function handleConversationTurn(conversation: Conversation, incomingText: string): Promise<void> {
  try {
    const config = await getSalesBotConfig(conversation.tenantId)
    const history = await getRecentHistory(conversation.id, incomingText)
    // Реальные услуги/мастера/свободные слоты салона для системного промпта.
    const serviceContext = await buildServiceContext(conversation.tenantId)

    const result = await processSalesMessage({
      incomingText,
      history,
      config: {
        // Нет конфига → турнкей: бот включён с дефолтными настройками.
        isEnabled: config ? config.isEnabled : true,
        botName: config?.botName ?? null,
        greeting: config?.greeting ?? null,
        systemPrompt: config?.systemPrompt ?? null,
        settings: (config?.settings as SalesChatbotSettings | null) ?? null,
      },
      conversationStatus: conversation.status,
      serviceContext,
    })

    if (result.action === "sent" && result.reply) {
      // Короткое «минутку…» перед основным ответом (если включено настройками).
      if (result.preMessage) {
        await sendToConversation(conversation, {
          to: conversation.externalUserId,
          text: result.preMessage,
          parseMode: "plain",
        })
        await sleep(result.preMessageDelayMs ?? 0)
      }
      await sleep(result.replyDelayMs ?? 0)
      await sendToConversation(conversation, {
        to: conversation.externalUserId,
        text: result.reply,
        parseMode: "plain",
      })

      // Если клиент подтвердил конкретную запись — создаём предварительную бронь
      // (статус pending/confirmed по настройке booking.autoConfirm).
      if (result.category === "booking_scheduling" || result.category === "ready_to_buy") {
        await tryCreateBooking(
          conversation,
          incomingText,
          result.reply,
          history,
          serviceContext.contextText,
          (config?.settings as SalesChatbotSettings | null) ?? null,
        )
      }
      return
    }

    if (result.action === "escalated") {
      // Бот замолкает, разговор переходит к администратору.
      await pauseForHuman(conversation.id)
      await recordMessage({
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        direction: "outbound",
        role: "manager",
        text: `[эскалация на администратора: ${result.escalationReason ?? "—"}]`,
      })
      // TODO (Спринт 3): уведомить салон в Telegram-канал/интерфейс.
      return
    }

    // action === "skipped" → бот намеренно молчит, ничего не делаем.
  } catch (err) {
    console.error("[sales:handle-turn] failed:", err)
  }
}

// Попытка зафиксировать бронь, если клиент подтвердил конкретный слот.
// Извлекаем услугу/дату/время из диалога и создаём предварительную бронь.
// Дефолт безопасный: статус "pending" (админ подтверждает), если только в
// настройках не включён booking.autoConfirm.
async function tryCreateBooking(
  conversation: Conversation,
  clientText: string,
  botReply: string,
  history: Array<{ role: "user" | "assistant"; text: string }>,
  serviceContextText: string | null,
  rawSettings: SalesChatbotSettings | null,
): Promise<void> {
  try {
    const settings = resolveSalesChatbotSettings(rawSettings)
    const todayISO = new Date().toISOString().slice(0, 10)

    const extraction = await extractBookingConfirmation({
      history,
      latestClientText: clientText,
      latestBotReply: botReply,
      serviceContextText,
      todayISO,
    })
    if (!extraction.shouldBook || extraction.confidence < 0.6) return

    const res = await createBookingFromExtraction({
      tenantId: conversation.tenantId,
      extraction,
      contactId: conversation.contactId,
      clientName: conversation.externalUserName,
      autoConfirm: settings.booking.autoConfirm ?? false,
    })

    // Сообщаем клиенту результат (подтверждение или «время занято»).
    if (res.confirmationText) {
      await sendToConversation(conversation, {
        to: conversation.externalUserId,
        text: res.confirmationText,
        parseMode: "plain",
      })
    }
    if (res.created) {
      console.log(`[sales:handle-turn] бронь создана (${res.status}) conv=${conversation.id}`)
    }
  } catch (err) {
    console.error("[sales:handle-turn] tryCreateBooking failed:", err)
  }
}
