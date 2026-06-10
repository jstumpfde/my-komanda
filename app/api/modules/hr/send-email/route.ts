import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as {
      candidateId: string
      subject: string
      body: string
    }

    if (!body.candidateId || !body.subject || !body.body) {
      return apiError("candidateId, subject и body обязательны", 400)
    }

    // Получаем email кандидата из БД — не принимаем to из тела запроса
    // (защита от open relay). Проверяем tenant-принадлежность через JOIN.
    const rows = await db
      .select({ email: candidates.email, name: candidates.name })
      .from(candidates)
      .innerJoin(vacancies, and(
        eq(candidates.vacancyId, vacancies.id),
        eq(vacancies.companyId, user.companyId),
      ))
      .where(eq(candidates.id, body.candidateId))
      .limit(1)

    const candidate = rows[0]
    if (!candidate) return apiError("Кандидат не найден", 404)
    if (!candidate.email?.trim()) return apiError("У кандидата нет email", 400)

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
      to: candidate.email.trim(),
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
