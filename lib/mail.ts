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

interface SendMailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendMail({ to, subject, text, html }: SendMailOptions) {
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
  })

  return info
}
