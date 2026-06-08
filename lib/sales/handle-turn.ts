// Обработка одного хода диалога: загрузить конфиг бота + историю, прогнать через
// процессор-«мозг», применить поведение по настройкам (ночь/«печатает»/задержка/
// бронь/уведомления) и отправить ответ (или передать человеку).
//
// Вызывается из webhook ФОНОМ (без await), чтобы Telegram получал быстрый 200.
//
// ВАЖНО (ограничение MVP): фоновая обработка живёт в памяти Node-процесса. При
// рестарте незавершённые ходы теряются. Надёжность позже — очередь/cron.

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesMessages } from "@/lib/db/schema"
import { processSalesMessage } from "@/lib/ai/sales-chatbot-processor"
import { getSalesBotConfig } from "./bot-config"
import {
  sendToConversation,
  pauseForHuman,
  recordMessage,
  sendTypingIndicator,
  sendViaConversationChannel,
  type Conversation,
} from "./conversations"
import { buildServiceContext } from "./service-context"
import {
  resolveSalesChatbotSettings,
  type SalesChatbotSettings,
} from "@/lib/ai/sales-chatbot-settings"
import { extractBookingConfirmation } from "./booking-extraction"
import { createBookingFromExtraction } from "./create-booking"
import { sendEmail } from "@/lib/email/smtp"

type ResolvedSettings = ReturnType<typeof resolveSalesChatbotSettings>

// Кап на каждую задержку, чтобы один диалог не висел вечно.
const SLEEP_CAP_MS = 60_000
const HISTORY_LIMIT = 8

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.min(Math.max(ms, 0), SLEEP_CAP_MS)))
}

// Сейчас «ночь» по настройкам? Поддерживает переход через полночь (напр. 22→9).
function isNightNow(s: ResolvedSettings): boolean {
  if (!s.nightMode.enabled) return false
  const start = s.nightMode.startHour ?? 22
  const end = s.nightMode.endHour ?? 9
  if (start === end) return false
  const h = new Date().getHours()
  return start < end ? h >= start && h < end : h >= start || h < end
}

// Человечная задержка ответа — случайно в диапазоне [min..max] секунд.
function randomDelayMs(s: ResolvedSettings): number {
  const min = Math.max(0, s.responseDelay.minSeconds ?? 0)
  const max = Math.max(min, s.responseDelay.maxSeconds ?? min)
  return Math.round((min + Math.random() * (max - min)) * 1000)
}

// Недавняя история диалога для контекста (исключая текущее входящее).
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
  if (
    chrono.length &&
    chrono[chrono.length - 1].role === "user" &&
    chrono[chrono.length - 1].text === currentText
  ) {
    chrono.pop()
  }
  return chrono
}

// Отправить ответ клиенту с «человечным» поведением: показать «печатает…»,
// выдержать задержку из диапазона, затем отправить текст.
async function sendHumanlike(conversation: Conversation, text: string, s: ResolvedSettings): Promise<void> {
  if (s.typing.enabled) await sendTypingIndicator(conversation)
  await sleep(randomDelayMs(s))
  await sendToConversation(conversation, {
    to: conversation.externalUserId,
    text,
    parseMode: "plain",
  })
}

export async function handleConversationTurn(conversation: Conversation, incomingText: string): Promise<void> {
  try {
    const config = await getSalesBotConfig(conversation.tenantId)
    const settings = resolveSalesChatbotSettings((config?.settings as SalesChatbotSettings | null) ?? null)
    const history = await getRecentHistory(conversation.id, incomingText)
    const serviceContext = await buildServiceContext(conversation.tenantId)

    const result = await processSalesMessage({
      incomingText,
      history,
      config: {
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
      // Ночной режим: мгновенное авто-сообщение (без задержки), если включено.
      if (isNightNow(settings) && settings.nightMode.mode === "instant_ack" && settings.nightMode.ackMessage) {
        await sendToConversation(conversation, {
          to: conversation.externalUserId,
          text: settings.nightMode.ackMessage,
          parseMode: "plain",
        })
      }

      // Бронь: если интент записи — пробуем зафиксировать. Если бронь/слот-ответ
      // отправлены — основной сгенерированный ответ НЕ дублируем (дедуп).
      let bookingHandled = false
      if (result.category === "booking_scheduling" || result.category === "ready_to_buy") {
        bookingHandled = await tryCreateBooking(
          conversation,
          incomingText,
          result.reply,
          history,
          serviceContext.contextText,
          settings,
        )
      }

      if (!bookingHandled) {
        // Короткое «минутку…» перед основным ответом (если включено).
        if (result.preMessage) {
          await sendToConversation(conversation, {
            to: conversation.externalUserId,
            text: result.preMessage,
            parseMode: "plain",
          })
          await sleep(result.preMessageDelayMs ?? 0)
        }
        await sendHumanlike(conversation, result.reply, settings)
      }
      return
    }

    if (result.action === "escalated") {
      await pauseForHuman(conversation.id)
      await recordMessage({
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        direction: "outbound",
        role: "manager",
        text: `[эскалация на администратора: ${result.escalationReason ?? "—"}]`,
      })
      await notifySalon(
        conversation,
        settings,
        `🔔 Диалог требует внимания администратора (${result.escalationReason ?? "эскалация"}). Клиент: ${conversation.externalUserName ?? conversation.externalUserId}.`,
      )
      return
    }

    // action === "skipped" → бот намеренно молчит.
  } catch (err) {
    console.error("[sales:handle-turn] failed:", err)
  }
}

// Попытка зафиксировать бронь. Возвращает true, если клиенту что-то отправлено
// (подтверждение брони или «слот занят») — тогда основной ответ не дублируется.
async function tryCreateBooking(
  conversation: Conversation,
  clientText: string,
  botReply: string,
  history: Array<{ role: "user" | "assistant"; text: string }>,
  serviceContextText: string | null,
  settings: ResolvedSettings,
): Promise<boolean> {
  try {
    const todayISO = new Date().toISOString().slice(0, 10)
    const extraction = await extractBookingConfirmation({
      history,
      latestClientText: clientText,
      latestBotReply: botReply,
      serviceContextText,
      todayISO,
    })
    if (!extraction.shouldBook || extraction.confidence < 0.6) return false

    const res = await createBookingFromExtraction({
      tenantId: conversation.tenantId,
      extraction,
      contactId: conversation.contactId,
      clientName: conversation.externalUserName,
      autoConfirm: settings.booking.autoConfirm ?? false,
      slotTakenMessage: settings.slotTaken?.message ?? null,
    })

    if (res.confirmationText) {
      await sendHumanlike(conversation, res.confirmationText, settings)
    }

    if (res.created) {
      await notifySalon(
        conversation,
        settings,
        `🔔 Новая предварительная запись: ${extraction.serviceName ?? "услуга"} ${extraction.date ?? ""} ${extraction.time ?? ""}. Клиент: ${conversation.externalUserName ?? conversation.externalUserId}. Статус: ${res.status === "confirmed" ? "подтверждена" : "ожидает подтверждения"}.`,
      )
    }

    return Boolean(res.confirmationText)
  } catch (err) {
    console.error("[sales:handle-turn] tryCreateBooking failed:", err)
    return false
  }
}

// Уведомить салон (мастер/владелец/админ) о событии — по настройкам каналов.
async function notifySalon(conversation: Conversation, settings: ResolvedSettings, text: string): Promise<void> {
  const n = settings.notifications
  if (!n) return
  try {
    if (n.channels?.includes("telegram") && n.telegramChatId) {
      await sendViaConversationChannel(conversation, n.telegramChatId, text)
    }
    if (n.channels?.includes("email") && n.email) {
      await sendEmail({ to: n.email, subject: "Уведомление от бота записи", html: text, text })
    }
  } catch (err) {
    console.error("[sales:handle-turn] notifySalon failed:", err)
  }
}
