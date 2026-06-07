// Адаптер email поверх существующего lib/email/smtp.ts. Кнопки email не
// поддерживает (деградирует до текста на стороне вызывающего). Приём входящих
// email (IMAP/webhook провайдера) — отдельный этап, пока parseInbound вернёт [].

import { sendEmail } from "@/lib/email/smtp"
import type {
  ChannelAdapter,
  ChannelCredentials,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from "./types"

export const emailAdapter: ChannelAdapter = {
  type: "email",
  supportsButtons: false,

  async send(_creds: ChannelCredentials, message: OutboundMessage): Promise<SendResult> {
    if (!message.to?.trim()) return { ok: false, skipped: true, reason: "no_recipient" }
    if (!message.text?.trim()) return { ok: false, skipped: true, reason: "empty_message" }

    const html = message.parseMode === "HTML" ? message.text : textToHtml(message.text)
    const res = await sendEmail({
      to: message.to,
      subject: message.subject || "Сообщение",
      html,
      text: stripHtml(message.text),
    })
    return {
      ok: res.ok,
      skipped: res.simulated,
      reason: res.simulated ? "simulated" : undefined,
      error: res.error,
    }
  },

  parseInbound(): InboundMessage[] {
    // TODO: входящие email (IMAP/webhook провайдера) — отдельный этап.
    return []
  },
}

function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "")
}
