import { NextRequest } from "next/server"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as {
      to: string
      subject: string
      body: string
      candidateId?: string
      vacancyId?: string
    }

    if (!body.to || !body.subject || !body.body) {
      return apiError("to, subject и body обязательны", 400)
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || 587)
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS

    if (!smtpHost || !smtpUser || !smtpPass) {
      return apiError("SMTP не настроен. Добавьте SMTP_HOST, SMTP_USER, SMTP_PASS в переменные окружения.", 503)
    }

    const nodemailer = await import("nodemailer")
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    })

    await transporter.sendMail({
      from: smtpUser,
      to: body.to,
      subject: body.subject,
      html: body.body,
    })

    return apiSuccess({ sent: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("send-email error:", err)
    return apiError("Не удалось отправить email", 500)
  }
}
