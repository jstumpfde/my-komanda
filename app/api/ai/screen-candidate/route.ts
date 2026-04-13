import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const client = new Anthropic()

export interface ScreeningResult {
  score: number
  verdict: "подходит" | "возможно" | "не подходит"
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  autoAction: "invite" | "review" | "reject"
}

const SYSTEM_PROMPT = `Ты — AI-рекрутер. Сравни данные кандидата с требованиями вакансии и дай оценку.

ПРАВИЛА:
- Оценивай СТРОГО на основе предоставленных данных. Не додумывай.
- Если данных о кандидате мало — снижай уверенность, но не ставь 0.
- score: 0-100 (реалистично: 85+ = отличное совпадение, 60-84 = хорошее, 40-59 = частичное, <40 = слабое)
- verdict: "подходит" (70+), "возможно" (40-69), "не подходит" (<40)
- strengths/weaknesses: 2-3 конкретных пункта каждый, короткие фразы
- recommendation: 1-2 предложения, что делать с кандидатом
- autoAction: "invite" (70+), "review" (40-69), "reject" (<40)

ФОРМАТ — только валидный JSON:
{
  "score": 75,
  "verdict": "подходит",
  "strengths": ["Опыт B2B продаж 3 года", "Знание CRM"],
  "weaknesses": ["Нет опыта в отрасли"],
  "recommendation": "Пригласить на интервью. Уточнить опыт в отрасли.",
  "autoAction": "invite"
}`

interface ScreenInput {
  candidateData: {
    name?: string
    resume?: string
    experience?: string
    skills?: string[]
    city?: string
    salary?: string
  }
  vacancyAnketa: {
    vacancyTitle?: string
    requirements?: string
    responsibilities?: string
    requiredSkills?: string[]
    desiredSkills?: string[]
    experienceMin?: string
    positionCity?: string
    conditions?: string[]
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const body = (await req.json()) as ScreenInput
    const { candidateData: cd, vacancyAnketa: va } = body

    if (!cd || !va) return apiError("Данные кандидата и анкеты обязательны", 400)

    const userMessage = `ВАКАНСИЯ:
Должность: ${va.vacancyTitle || "не указана"}
Обязанности: ${va.responsibilities || "не указаны"}
Требования: ${va.requirements || "не указаны"}
Обязательные навыки: ${va.requiredSkills?.join(", ") || "не указаны"}
Желательные навыки: ${va.desiredSkills?.join(", ") || "не указаны"}
Опыт: от ${va.experienceMin || "?"} лет
Город: ${va.positionCity || "не указан"}

КАНДИДАТ:
Имя: ${cd.name || "не указано"}
Опыт: ${cd.experience || "не указан"}
Навыки: ${cd.skills?.join(", ") || "не указаны"}
Город: ${cd.city || "не указан"}
Зарплата: ${cd.salary || "не указана"}
Резюме/Доп. информация: ${cd.resume || "нет данных"}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiSuccess(fallbackScreen(cd, va))
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== "text") return apiError("Неожиданный ответ AI", 500)

    let parsed: Record<string, unknown>
    try {
      const raw = content.text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
      parsed = JSON.parse(raw)
    } catch {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        return apiError("Не удалось разобрать ответ AI", 422)
      }
    }

    const result: ScreeningResult = {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 50)),
      verdict: (["подходит", "возможно", "не подходит"].includes(String(parsed.verdict))
        ? String(parsed.verdict)
        : "возможно") as ScreeningResult["verdict"],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 5) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String).slice(0, 5) : [],
      recommendation: String(parsed.recommendation || ""),
      autoAction: (["invite", "review", "reject"].includes(String(parsed.autoAction))
        ? String(parsed.autoAction)
        : "review") as ScreeningResult["autoAction"],
    }

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("screen-candidate error:", err)
    return apiError("Internal server error", 500)
  }
}

function fallbackScreen(
  cd: ScreenInput["candidateData"],
  va: ScreenInput["vacancyAnketa"]
): ScreeningResult {
  let score = 50
  const strengths: string[] = []
  const weaknesses: string[] = []

  // Simple keyword matching
  const reqSkills = new Set((va.requiredSkills || []).map(s => s.toLowerCase()))
  const candSkills = new Set((cd.skills || []).map(s => s.toLowerCase()))
  let matched = 0
  for (const s of reqSkills) {
    if (candSkills.has(s)) matched++
  }
  if (reqSkills.size > 0) {
    const ratio = matched / reqSkills.size
    score = Math.round(40 + ratio * 50)
    if (ratio > 0.5) strengths.push(`Совпадение навыков: ${matched}/${reqSkills.size}`)
    if (ratio < 0.5) weaknesses.push(`Не хватает навыков: ${reqSkills.size - matched} из ${reqSkills.size}`)
  }

  if (cd.experience) strengths.push(`Опыт: ${cd.experience}`)
  if (!cd.experience) weaknesses.push("Опыт не указан")

  const verdict = score >= 70 ? "подходит" : score >= 40 ? "возможно" : "не подходит"
  const autoAction = score >= 70 ? "invite" : score >= 40 ? "review" : "reject"

  return {
    score,
    verdict: verdict as ScreeningResult["verdict"],
    strengths: strengths.length > 0 ? strengths : ["Данных недостаточно для оценки"],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["Мало информации о кандидате"],
    recommendation: score >= 70 ? "Рекомендуем пригласить на интервью" : score >= 40 ? "Требуется ручной разбор" : "Кандидат не соответствует требованиям",
    autoAction: autoAction as ScreeningResult["autoAction"],
  }
}
