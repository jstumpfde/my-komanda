import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.timeweb.ru",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "admin@mycomanda24.ru",
    pass: process.env.SMTP_PASS || "",
  },
})

interface MailAttachment {
  filename: string
  content: string | Buffer
  contentType?: string
}

interface SendMailOptions {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: MailAttachment[]
}

export async function sendMail({ to, subject, text, html, attachments }: SendMailOptions) {
  if (process.env.INTEGRATIONS_DISABLED === "true") {
    console.log("[INTEGRATIONS_DISABLED] sendMail skipped:", to)
    return { messageId: "disabled", accepted: [], rejected: [] }
  }

  const from = process.env.SMTP_FROM || "admin@mycomanda24.ru"

  const info = await transporter.sendMail({
    from: `"Моя Команда" <${from}>`,
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, "<br>"),
    ...(attachments?.length ? { attachments } : {}),
  })

  return info
}
