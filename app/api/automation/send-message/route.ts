import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { sendMail } from "@/lib/mail"

interface AutomationSettings {
  tone?: "official" | "casual" | "custom"
  firstMessageText?: string
  delayMinutes?: number
  workingHours?: {
    enabled: boolean
    from: string // "09:00"
    to: string   // "20:00"
  }
}

function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template
  result = result.replace(/\[Имя\]/g, vars.name || "")
  result = result.replace(/\[должность\]/g, vars.position || "")
  result = result.replace(/\[компания\]/g, vars.company || "")
  result = result.replace(/\[ссылка\]/g, vars.link || "")
  return result
}

function isWithinWorkingHours(settings: AutomationSettings["workingHours"]): boolean {
  if (!settings?.enabled) return true
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const current = hours * 60 + minutes

  const [fromH, fromM] = (settings.from || "09:00").split(":").map(Number)
  const [toH, toM] = (settings.to || "20:00").split(":").map(Number)
  const from = fromH * 60 + fromM
  const to = toH * 60 + toM

  return current >= from && current <= to
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { candidateId: string; vacancyId: string }

    if (!body.candidateId || !body.vacancyId) {
      return apiError("candidateId и vacancyId обязательны", 400)
    }

    // Загружаем вакансию
    const [vacancy] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Вакансия не найдена", 404)

    // Загружаем кандидата
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, body.candidateId), eq(candidates.vacancyId, body.vacancyId)))
      .limit(1)

    if (!candidate) return apiError("Кандидат не найден", 404)
    if (!candidate.email) return apiError("У кандидата нет email", 400)

    // Загружаем компанию
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    // Читаем настройки автоматизации
    const descJson = vacancy.descriptionJson as Record<string, unknown> | null
    const automation = (descJson?.automation as AutomationSettings) || {}

    // Проверяем рабочие часы
    if (!isWithinWorkingHours(automation.workingHours)) {
      return apiError("Сейчас нерабочее время. Сообщение будет отправлено позже", 429)
    }

    // Формируем текст
    const template = automation.firstMessageText || getDefaultTemplate(automation.tone || "casual")
    const candidateToken = candidate.token || candidate.id
    const text = replaceVariables(template, {
      name: candidate.name.split(" ")[0],
      position: vacancy.title,
      company: company?.name || "",
      link: `${process.env.NEXTAUTH_URL || "https://mycomanda24.ru"}/candidate/${candidateToken}`,
    })

    // Отправляем
    await sendMail({
      to: candidate.email,
      subject: `${vacancy.title} — ${company?.name || "Моя Команда"}`,
      text,
    })

    return apiSuccess({ sent: true, to: candidate.email })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[automation/send-message]", err)
    return apiError("Internal server error", 500)
  }
}

function getDefaultTemplate(tone: "official" | "casual" | "custom"): string {
  if (tone === "official") {
    return `Здравствуйте, [Имя].
Благодарим за отклик на вакансию [должность]. Мы подготовили информационную презентацию о компании и должности (около 15 минут).
Предлагаем вам ознакомиться с материалами по ссылке ниже. После просмотра вы сможете записаться на собеседование.
[ссылка]`
  }
  return `[Имя], привет! Видели ваш отклик на [должность] — выглядит интересно 👋
Чтобы не тратить ваше время на формальное интервью, сделали короткий обзор должности на 15 мин — там реальные цифры дохода и как устроена работа.
Если после просмотра захотите пообщаться — сразу договоримся на звонок 🙂
[ссылка]`
}
