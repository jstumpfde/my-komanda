import nodemailer from "nodemailer"

// Singleton — переподнимать transport на каждый запрос дорого.
let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.timeweb.ru",
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || "",
    },
  })
  return cachedTransporter
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendEmailResult {
  ok: boolean
  simulated?: boolean
  messageId?: string
  error?: string
}

// Если SMTP_PASSWORD не задан — НЕ падаем, логируем и возвращаем ok.
// Это позволяет тестировать форму без настроенного SMTP-провайдера.
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const password = process.env.SMTP_PASSWORD || process.env.SMTP_PASS
  if (!password) {
    console.log("[EMAIL] SMTP_PASSWORD not set — would send to", params.to, ":", params.subject)
    return { ok: true, simulated: true }
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@mycomanda24.ru"

  try {
    const info = await getTransporter().sendMail({
      from: `Company24 <${fromAddress}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : "smtp_error"
    console.error("[EMAIL] send failed:", message)
    return { ok: false, error: message }
  }
}
