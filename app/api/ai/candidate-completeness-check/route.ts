import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { candidateId: string; vacancyId: string }

    if (!body.candidateId) return apiError("candidateId обязателен", 400)

    const [candidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, body.candidateId))
      .limit(1)

    if (!candidate) return apiError("Кандидат не найден", 404)

    const [vacancy] = body.vacancyId
      ? await db.select({ title: vacancies.title }).from(vacancies)
          .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId))).limit(1)
      : [null]

    // Check completeness
    const fields: { key: string; label: string; filled: boolean }[] = [
      { key: "name", label: "ФИО", filled: !!candidate.name?.trim() },
      { key: "email", label: "Email", filled: !!candidate.email?.trim() },
      { key: "phone", label: "Телефон", filled: !!candidate.phone?.trim() },
      { key: "city", label: "Город", filled: !!candidate.city?.trim() },
      { key: "experience", label: "Опыт работы", filled: !!candidate.experience?.trim() },
    ]

    // Check demo answers
    const answers = candidate.anketaAnswers as { question: string; answer: string }[] | null
    fields.push({ key: "answers", label: "Ответы на вопросы", filled: Array.isArray(answers) && answers.length > 0 })

    const filled = fields.filter(f => f.filled).length
    const total = fields.length
    const score = Math.round((filled / total) * 100)
    const missingFields = fields.filter(f => !f.filled).map(f => f.label)
    const shouldContact = missingFields.length > 0 && score < 70

    // Generate message
    let message = ""
    if (shouldContact) {
      const name = candidate.name?.split(" ")[0] || "кандидат"
      const position = vacancy?.title || "вакансию"
      const missingList = missingFields.map(f => `— Укажите ${f.toLowerCase()}`).join("\n")
      message = `Здравствуйте, ${name}! Спасибо за интерес к позиции "${position}". Для продолжения рассмотрения хотели бы уточнить:\n\n${missingList}\n\nВы можете дополнить данные по ссылке или отправить ответом на это сообщение.`
    }

    return apiSuccess({ score, missingFields, message, shouldContact, fields })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
