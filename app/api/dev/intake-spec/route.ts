import { intakeToScoringSpec, type IntakeData } from "@/lib/scoring/intake-to-spec"
import { apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/dev/intake-spec — прогнать пример заявки клиента через конвертер
// intake → ScoringSpec. Только не-прод (демонстрация конвейера).
const SAMPLE_INTAKE: IntakeData = {
  title: "Менеджер по продажам B2B",
  description: "Активные продажи AI-CRM по входящим и холодным лидам, ведение сделок в CRM, выполнение плана.",
  requirements: "Опыт B2B-продаж, грамотная речь, работа с CRM, английский желателен.",
  city: "Москва",
  workFormat: "remote",
  salaryFrom: "80000",
  salaryTo: "150000",
  mustHave: "Опыт активных B2B-продаж от 2 лет, работа с CRM, грамотная устная и письменная речь, готовность к высокому темпу.",
  dealBreakers: "Нет опыта продаж, частая смена работы (меньше года на месте), только пассивные продажи без холодных звонков.",
  goodExample: "Продавал SaaS/IT-продукты, закрывал сделки от лида до подписания, перевыполнял план, вёл всё в CRM.",
  badExample: "Работал только продавцом-консультантом в рознице, без B2B и без CRM.",
  topPriority: "Реальный опыт закрытия B2B-сделок и дисциплина в CRM важнее диплома.",
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return apiError("Not found", 404)
  try {
    const spec = await intakeToScoringSpec(SAMPLE_INTAKE)
    return apiSuccess({ spec })
  } catch (e) {
    return apiError(e instanceof Error ? `${e.message}\n${e.stack}` : String(e), 500)
  }
}
