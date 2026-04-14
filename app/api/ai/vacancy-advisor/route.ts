import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { AI_SAFETY_PROMPT, checkAiRateLimit, handleAiError } from "@/lib/ai-safety"
import { checkRateLimit } from "@/lib/rate-limit"
import { findBenchmark, adjustBenchmark, assessSalary, formatSalary, suggestTitles, marketStats, type SalaryBenchmark } from "@/lib/salary-benchmarks"

const client = new Anthropic()

interface SectionAnalysis {
  id: string
  status: "ok" | "warning" | "error"
  title: string
  message: string
  priority: number
}

interface SalaryAnalysis {
  marketMedian: number
  previousMedian: number
  yoyGrowth: number
  period: string
  currentAssessment: string
  recommendedRange: { min: number; max: number }
  impactNote: string | null
  widthWarning: string | null
  responseNote: string | null
  withoutSalaryLoss: number
}

interface Suggestions {
  titles: string[]
  skills: string[]
  stopFactors: string[]
  duties: string
  requirements: string
}

interface AdvisorResponse {
  score: number
  scoreLabel: string
  sections: SectionAnalysis[]
  contextTip?: string
  suggestions?: Suggestions
  salaryAnalysis?: SalaryAnalysis
}

// ── Static fallback (no AI) ──────────────────────────────────────────────────

function staticAnalysis(body: Record<string, unknown>): AdvisorResponse {
  const d = body.vacancyData as Record<string, unknown> | undefined
  if (!d) return { score: 0, scoreLabel: "Не заполнено", sections: [], contextTip: undefined }

  const sections: SectionAnalysis[] = []
  let filled = 0
  const total = 8

  // 1. Title
  const title = (d.vacancyTitle as string) || ""
  if (!title) {
    sections.push({ id: "title", status: "error", title: "Название", message: "Укажите название вакансии", priority: 0 })
  } else if (title.length < 10) {
    sections.push({ id: "title", status: "warning", title: "Название", message: "Название слишком короткое — добавьте ключевые слова для поиска", priority: 5 })
    filled += 0.5
  } else {
    sections.push({ id: "title", status: "ok", title: "Название", message: "Заполнено", priority: 10 })
    filled++
  }

  // 2. Salary
  const salaryFrom = d.salaryFrom as string | undefined
  const salaryTo = d.salaryTo as string | undefined
  if (!salaryFrom && !salaryTo) {
    sections.push({ id: "salary", status: "error", title: "Зарплата", message: "Укажите зарплату — без неё теряется до 50% откликов", priority: 1 })
  } else {
    sections.push({ id: "salary", status: "ok", title: "Зарплата", message: "Заполнено", priority: 10 })
    filled++
  }

  // 3. Responsibilities
  const resp = (d.responsibilities as string) || ""
  const respLines = resp.split("\n").filter((l: string) => l.trim()).length
  if (!resp.trim()) {
    sections.push({ id: "responsibilities", status: "error", title: "Обязанности", message: "Добавьте минимум 3-5 пунктов обязанностей", priority: 2 })
  } else if (respLines < 3) {
    sections.push({ id: "responsibilities", status: "warning", title: "Обязанности", message: `Указано ${respLines} пункт(ов) — рекомендуется минимум 3-5`, priority: 4 })
    filled += 0.5
  } else {
    sections.push({ id: "responsibilities", status: "ok", title: "Обязанности", message: `${respLines} пунктов — хорошо`, priority: 10 })
    filled++
  }

  // 4. Requirements
  const req = (d.requirements as string) || ""
  const reqLines = req.split("\n").filter((l: string) => l.trim()).length
  if (!req.trim()) {
    sections.push({ id: "requirements", status: "error", title: "Требования", message: "Добавьте минимум 3 пункта требований", priority: 2 })
  } else if (reqLines < 3) {
    sections.push({ id: "requirements", status: "warning", title: "Требования", message: `Указано ${reqLines} пункт(ов) — рекомендуется минимум 3`, priority: 4 })
    filled += 0.5
  } else {
    sections.push({ id: "requirements", status: "ok", title: "Требования", message: `${reqLines} пунктов — хорошо`, priority: 10 })
    filled++
  }

  // 5. Skills
  const requiredSkills = (d.requiredSkills as string[]) || []
  const desiredSkills = (d.desiredSkills as string[]) || []
  const totalSkills = requiredSkills.length + desiredSkills.length
  if (requiredSkills.length === 0) {
    sections.push({ id: "skills", status: "error", title: "Навыки", message: "Добавьте обязательные навыки — минимум 3", priority: 3 })
  } else if (totalSkills < 8) {
    sections.push({ id: "skills", status: "warning", title: "Навыки", message: `${totalSkills} навыков — рекомендуется 8-12 (обязательные + желательные)`, priority: 5 })
    filled += 0.5
  } else {
    sections.push({ id: "skills", status: "ok", title: "Навыки", message: `${totalSkills} навыков — отлично`, priority: 10 })
    filled++
  }

  // 6. Stop factors
  const unacceptable = (d.unacceptableSkills as string[]) || []
  const stopFactors = (d.stopFactors as Array<{ enabled: boolean }>) || []
  const enabledStops = stopFactors.filter(f => f.enabled).length
  if (unacceptable.length === 0 && enabledStops === 0) {
    sections.push({ id: "stopFactors", status: "error", title: "Стоп-факторы", message: "Добавьте стоп-факторы — без них AI-скрининг не сможет отсеивать неподходящих кандидатов", priority: 2 })
  } else {
    sections.push({ id: "stopFactors", status: "ok", title: "Стоп-факторы", message: `${unacceptable.length + enabledStops} стоп-факторов`, priority: 10 })
    filled++
  }

  // 7. Conditions
  const conditions = (d.conditions as string[]) || []
  const conditionsCustom = (d.conditionsCustom as string[]) || []
  if (conditions.length + conditionsCustom.length === 0) {
    sections.push({ id: "conditions", status: "warning", title: "Условия", message: "Добавьте хотя бы 1 бенефит — это повышает привлекательность вакансии", priority: 6 })
  } else {
    sections.push({ id: "conditions", status: "ok", title: "Условия", message: `${conditions.length + conditionsCustom.length} условий`, priority: 10 })
    filled++
  }

  // 8. Company description
  const companyDesc = (body.companyDescription as string) || ""
  if (!companyDesc.trim()) {
    sections.push({ id: "company", status: "warning", title: "О компании", message: "Заполните описание компании в Настройках → Компания. Вакансии с описанием получают на 30% больше откликов", priority: 7 })
  } else {
    sections.push({ id: "company", status: "ok", title: "О компании", message: "Заполнено", priority: 10 })
    filled++
  }

  const score = Math.round((filled / total) * 100)
  const scoreLabel = score < 40 ? "Слабо" : score < 70 ? "Средне" : score < 90 ? "Хорошо" : "Отлично"

  sections.sort((a, b) => a.priority - b.priority)

  // Static salary analysis
  const salaryAnalysis = buildStaticSalaryAnalysis(d)

  // Static title suggestions
  const titleSuggestions = suggestTitles(title)

  const suggestions: Suggestions = {
    titles: titleSuggestions,
    skills: [],
    stopFactors: [],
    duties: "",
    requirements: "",
  }

  return { score, scoreLabel, sections, contextTip: undefined, suggestions, salaryAnalysis: salaryAnalysis || undefined }
}

function buildStaticSalaryAnalysis(d: Record<string, unknown>): SalaryAnalysis | null {
  const title = (d.vacancyTitle as string) || ""
  const category = (d.positionCategory as string) || ""
  const city = (d.positionCity as string) || ""
  const experienceMin = (d.experienceMin as string) || ""

  const benchmark = findBenchmark(title, category)
  if (!benchmark) return null

  const adjusted = adjustBenchmark(benchmark, city, experienceMin)
  const salaryFrom = parseSalaryNumber(d.salaryFrom as string)
  const salaryTo = parseSalaryNumber(d.salaryTo as string)

  // Рассчитать previousMedian с теми же коэффициентами
  const cityAdj = city ? (({ "Москва": 1.2, "Санкт-Петербург": 1.05, "Удалённо": 1.0 } as Record<string, number>)[city] || 0.7) : 1.0
  let expCoeff = 1.0
  if (experienceMin) {
    const years = parseInt(experienceMin)
    if (!isNaN(years)) {
      if (years <= 3) expCoeff = 0.7
      else if (years <= 5) expCoeff = 1.0
      else expCoeff = 1.3
    }
  }
  const coeff = cityAdj * expCoeff
  const previousMedian = Math.round(benchmark.previous.median * coeff / 1000) * 1000
  const withoutSalaryLoss = 100 - benchmark.responseRate.withoutSalary

  if (salaryFrom > 0 && salaryTo > 0) {
    const assessment = assessSalary(salaryFrom, salaryTo, adjusted, benchmark)
    return {
      marketMedian: adjusted.median,
      previousMedian,
      yoyGrowth: benchmark.yoyGrowth,
      period: benchmark.current.period,
      currentAssessment: assessment.assessment,
      recommendedRange: { min: adjusted.min, max: adjusted.max },
      impactNote: assessment.impactNote,
      widthWarning: assessment.widthWarning,
      responseNote: assessment.responseNote,
      withoutSalaryLoss,
    }
  }

  return {
    marketMedian: adjusted.median,
    previousMedian,
    yoyGrowth: benchmark.yoyGrowth,
    period: benchmark.current.period,
    currentAssessment: "не указана",
    recommendedRange: { min: adjusted.min, max: adjusted.max },
    impactNote: `Вакансии без зарплаты теряют до ${withoutSalaryLoss}% откликов. Рекомендуемая вилка: ${formatSalary(adjusted.min)}–${formatSalary(adjusted.max)}`,
    widthWarning: null,
    responseNote: null,
    withoutSalaryLoss,
  }
}

function parseSalaryNumber(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/\s/g, "").replace(/₽/g, "").replace(/руб\.?/gi, "")
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? 0 : num
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let user: { companyId?: string; id?: string }
  try {
    user = await requireAuth() as { companyId?: string; id?: string }
  } catch (e) {
    if (e instanceof Response) return e
    return apiError("Unauthorized", 401)
  }

  const tenantId = user.companyId || user.id || "default"

  // Per-endpoint rate limit: 1 per 3 seconds
  const rl = checkRateLimit(`vacancy-advisor:${tenantId}`, 20, 60_000) // 20 per minute
  if (!rl) return apiError("Слишком частые запросы. Подождите несколько секунд.", 429)

  // Daily AI rate limit
  const dailyLimit = checkAiRateLimit(tenantId)
  if (dailyLimit) return apiError(dailyLimit.message, 429)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError("Некорректный запрос", 400)
  }

  // Always compute static analysis as fallback
  const fallback = staticAnalysis(body)

  // If no API key, return static
  if (!process.env.ANTHROPIC_API_KEY) {
    return apiSuccess(fallback)
  }

  const vacancyData = body.vacancyData as Record<string, unknown> | undefined
  if (!vacancyData) return apiSuccess(fallback)

  const focusedField = (body.focusedField as string) || ""

  try {
    const prompt = buildPrompt(vacancyData, body, focusedField)

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: `Ты — AI-помощник для HR. Ты анализируешь анкету вакансии и даёшь рекомендации по улучшению.
Отвечай ТОЛЬКО валидным JSON. Никакого markdown, комментариев или текста вне JSON.
${AI_SAFETY_PROMPT}`,
      messages: [{ role: "user", content: prompt }],
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return apiSuccess(fallback)

    const parsed = JSON.parse(jsonMatch[0]) as AdvisorResponse

    // Validate and clamp score
    if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
      parsed.score = fallback.score
    }
    if (!parsed.scoreLabel) {
      parsed.scoreLabel = parsed.score < 40 ? "Слабо" : parsed.score < 70 ? "Средне" : parsed.score < 90 ? "Хорошо" : "Отлично"
    }
    if (!Array.isArray(parsed.sections)) {
      parsed.sections = fallback.sections
    }

    // Merge static salary analysis if AI didn't return one
    if (!parsed.salaryAnalysis && fallback.salaryAnalysis) {
      parsed.salaryAnalysis = fallback.salaryAnalysis
    }

    // Merge static title suggestions if AI didn't provide them
    if (!parsed.suggestions) {
      parsed.suggestions = fallback.suggestions
    } else {
      // Ensure titles from static if AI didn't suggest
      if (!parsed.suggestions.titles?.length && fallback.suggestions?.titles?.length) {
        parsed.suggestions.titles = fallback.suggestions.titles
      }
    }

    return apiSuccess(parsed)
  } catch (err) {
    // AI failed — return static fallback
    console.error("Vacancy advisor AI error:", handleAiError(err))
    return apiSuccess(fallback)
  }
}

function buildPrompt(d: Record<string, unknown>, body: Record<string, unknown>, focusedField: string): string {
  const parts: string[] = []

  parts.push("Проанализируй анкету вакансии и верни JSON с оценкой заполненности, рекомендациями и предложениями.")
  parts.push("")
  parts.push("═══ ДАННЫЕ АНКЕТЫ ═══")
  parts.push(`Название: ${d.vacancyTitle || "(пусто)"}`)
  parts.push(`Категория: ${d.positionCategory || "(пусто)"}`)
  parts.push(`Город: ${d.positionCity || "(пусто)"}`)
  parts.push(`Формат работы: ${(d.workFormats as string[])?.join(", ") || "(пусто)"}`)
  parts.push(`Занятость: ${(d.employment as string[])?.join(", ") || "(пусто)"}`)
  parts.push(`Зарплата от: ${d.salaryFrom || "(пусто)"}`)
  parts.push(`Зарплата до: ${d.salaryTo || "(пусто)"}`)
  parts.push(`Бонусы: ${d.bonus || "(пусто)"}`)
  parts.push(`Обязанности:\n${d.responsibilities || "(пусто)"}`)
  parts.push(`Требования:\n${d.requirements || "(пусто)"}`)
  parts.push(`Обязательные навыки: ${(d.requiredSkills as string[])?.join(", ") || "(пусто)"}`)
  parts.push(`Желательные навыки: ${(d.desiredSkills as string[])?.join(", ") || "(пусто)"}`)
  parts.push(`Неприемлемо: ${(d.unacceptableSkills as string[])?.join(", ") || "(пусто)"}`)

  const stopFactors = (d.stopFactors as Array<{ id: string; label: string; enabled: boolean }>) || []
  const enabled = stopFactors.filter(f => f.enabled).map(f => f.label)
  parts.push(`Стоп-факторы: ${enabled.join(", ") || "(пусто)"}`)

  const conditions = [...((d.conditions as string[]) || []), ...((d.conditionsCustom as string[]) || [])]
  parts.push(`Условия: ${conditions.join(", ") || "(пусто)"}`)

  parts.push(`Мин. опыт: ${d.experienceMin || "(пусто)"}`)
  parts.push(`Идеальный опыт: ${d.experienceIdeal || "(пусто)"}`)

  const companyDesc = (body.companyDescription as string) || ""
  parts.push(`\n═══ О КОМПАНИИ ═══`)
  parts.push(companyDesc || "(описание не заполнено)")

  // Справочник зарплат для контекста
  const title = (d.vacancyTitle as string) || ""
  const category = (d.positionCategory as string) || ""
  const benchmark = findBenchmark(title, category)
  if (benchmark) {
    const city = (d.positionCity as string) || ""
    const adjusted = adjustBenchmark(benchmark, city, (d.experienceMin as string) || "")
    parts.push(`\n═══ СПРАВОЧНИК ЗАРПЛАТ (${benchmark.current.period}) ═══`)
    parts.push(`Медиана рынка: ${formatSalary(adjusted.median)} (рост +${benchmark.yoyGrowth}% за год, было ${formatSalary(benchmark.previous.median)} в ${benchmark.previous.period})`)
    parts.push(`Диапазон рынка: ${formatSalary(adjusted.min)} — ${formatSalary(adjusted.max)}`)
    parts.push(`Без зарплаты теряется до ${100 - benchmark.responseRate.withoutSalary}% откликов`)
    if (city) parts.push(`(с учётом города ${city})`)
  }

  parts.push(`\n═══ РЫНОК ТРУДА ${marketStats.period} ═══`)
  parts.push(`Медианные зарплаты: +${marketStats.overallMedianGrowth}% за год`)
  parts.push(`Резюме: +${marketStats.resumeGrowth}%, новых резюме: +${marketStats.newResumeGrowth}%`)
  parts.push(`Junior-вакансий: −${marketStats.juniorVacancyDecline}%`)
  parts.push(`Оптимальный опыт: ${marketStats.optimalExperience}`)

  if (focusedField) {
    parts.push(`\n═══ КОНТЕКСТ ═══`)
    parts.push(`Пользователь сейчас редактирует поле: "${focusedField}". Дай контекстную подсказку для этого поля.`)
  }

  parts.push(`\n═══ ФОРМАТ ОТВЕТА ═══`)
  parts.push(`Верни JSON:
{
  "score": число от 0 до 100 (общая заполненность и качество),
  "scoreLabel": "Слабо" | "Средне" | "Хорошо" | "Отлично",
  "sections": [
    {
      "id": "salary" | "title" | "responsibilities" | "requirements" | "skills" | "stopFactors" | "conditions" | "company",
      "status": "ok" | "warning" | "error",
      "title": "Название секции",
      "message": "Конкретная рекомендация.",
      "priority": число (0 = самый важный)
    }
  ],
  "contextTip": "Контекстная подсказка для текущего поля (если focusedField указан)" | null,
  "suggestions": {
    "titles": ["2-3 варианта названия с высоким откликом на hh.ru"],
    "skills": ["Рекомендуемые навыки для этой должности которых нет в анкете"],
    "stopFactors": ["Рекомендуемые стоп-факторы для этой должности"],
    "duties": "5-7 пунктов обязанностей через \\n (если обязанности пусты или мало)",
    "requirements": "5-7 пунктов требований через \\n (если требования пусты или мало)"
  },
  "salaryAnalysis": {
    "marketMedian": число (медиана рынка),
    "currentAssessment": "ниже рынка" | "в рынке" | "выше рынка" | "не указана",
    "recommendedRange": { "min": число, "max": число },
    "impactNote": "Прогноз влияния на отклик" | null,
    "widthWarning": "Предупреждение о широкой вилке" | null
  }
}

Правила:
- Всегда анализируй все 8 секций: title, salary, responsibilities, requirements, skills, stopFactors, conditions, company
- Для зарплаты: используй справочник зарплат для конкретных рекомендаций
- Для стоп-факторов: если пусто — обязательно error, т.к. без них AI-скрининг не работает
- contextTip — только если focusedField указан, иначе null
- suggestions.titles — 2-3 варианта названия, которые дают больше откликов на hh.ru. Если название содержит аббревиатуру — предложить полную расшифровку. Если нет формата работы — предложить добавить. Если нет ниши — предложить добавить.
- suggestions.skills — 5-8 навыков, релевантных для должности, которых нет в анкете
- suggestions.stopFactors — 2-4 стоп-фактора, критичных для этой должности
- suggestions.duties — шаблон обязанностей (только если поле пустое или менее 3 пунктов)
- suggestions.requirements — шаблон требований (только если поле пустое или менее 3 пунктов)
- Рекомендации должны быть конкретными и практичными
- Все тексты на русском`)

  return parts.join("\n")
}
