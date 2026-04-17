import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import * as cheerio from "cheerio"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const anthropic = new Anthropic()

const SPLIT_PROMPT = `Раздели текст описания вакансии на две части:
1. Обязанности — что сотрудник будет делать (задачи, функционал, зоны ответственности)
2. Требования — что должен знать и уметь кандидат (опыт, навыки, образование, личные качества)

Верни JSON: { "responsibilities": "текст обязанностей", "requirements": "текст требований" }
Каждый пункт на новой строке, начинается с —. Без нумерации. Только JSON, без markdown.`

async function splitDescriptionWithAi(description: string): Promise<{ responsibilities: string; requirements: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SPLIT_PROMPT,
      messages: [{ role: "user", content: description }],
    })
    const content = response.content[0]
    if (content.type !== "text") return null
    const raw = content.text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
    let parsed: { responsibilities?: string; requirements?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null
      parsed = JSON.parse(jsonMatch[0])
    }
    return {
      responsibilities: String(parsed.responsibilities || "").trim(),
      requirements: String(parsed.requirements || "").trim(),
    }
  } catch (err) {
    console.error("[hh-import] AI split failed:", err)
    return null
  }
}

function extractCityName(raw: string): string {
  if (!raw) return ""
  return raw.split(",")[0].trim()
}

function parseNumber(raw: string | undefined | null): number | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, "")
  return digits ? Number(digits) : null
}

function detectCurrency(text: string): string {
  if (/₽|руб/i.test(text)) return "RUR"
  if (/\$|USD/i.test(text)) return "USD"
  if (/€|EUR/i.test(text)) return "EUR"
  if (/₸|KZT/i.test(text)) return "KZT"
  if (/Br|BYN/i.test(text)) return "BYN"
  return ""
}

function mapExperience(text: string): string {
  if (!text) return ""
  const t = text.toLowerCase()
  if (/не требу|без опыта|no experience/.test(t)) return "noExperience"
  if (/более 6|от 6|свыше 6|more than 6/.test(t)) return "moreThan6"
  if (/3[–\-—]6|от 3|between 3 and 6/.test(t)) return "between3And6"
  if (/1[–\-—]3|от 1|between 1 and 3/.test(t)) return "between1And3"
  return ""
}

function mapEmployment(text: string): string {
  if (!text) return ""
  const t = text.toLowerCase()
  if (/стаж/.test(t)) return "probation"
  if (/проект|времен/.test(t)) return "project"
  if (/частичн|part/.test(t)) return "part"
  if (/полн|full/.test(t)) return "full"
  return ""
}

function mapSchedule(text: string): string {
  if (!text) return ""
  const t = text.toLowerCase()
  if (/удал[её]нн|remote/.test(t)) return "remote"
  if (/гибкий|flexible/.test(t)) return "flexible"
  if (/сменн|shift/.test(t)) return "shift"
  if (/вахт|fly.in/.test(t)) return "flyInFlyOut"
  if (/полный день|full.?day|5\/2|2\/2/.test(t)) return "fullDay"
  return ""
}

type Mapped = {
  title: string
  description: string
  salaryFrom: number | null
  salaryTo: number | null
  salaryCurrency: string
  experience: string
  employment: string
  schedule: string
  city: string
  skills: string[]
  specialization: string
}

function parseHhHtml(html: string): Mapped {
  const $ = cheerio.load(html)

  // ─── A) Meta description — primary source for salary/exp/employment/city ─
  const metaDesc = $('meta[name="description"]').attr("content") || ""

  const metaSalary = metaDesc.match(/Зарплата:\s*([^.]+?)(?=\.|$)/i)?.[1] || ""
  const metaExperienceText = metaDesc.match(/Требуемый опыт[^:]*:\s*([^.]+)/i)?.[1]?.trim() || ""
  const metaEmploymentText = metaDesc.match(/Занятость:\s*([^.]+)/i)?.[1]?.trim() || ""

  // City: between company-name salary sentence and "Требуемый опыт"
  // Example: "...за месяц. Москва. Требуемый опыт: ..."
  let metaCity = ""
  const cityMatch = metaDesc.match(/\.\s*([А-ЯЁA-Z][^.]*?)\s*\.\s*Требуемый опыт/)
  if (cityMatch) metaCity = cityMatch[1].trim()

  // ─── B) data-qa blocks ──────────────────────────────────────────────────
  const qaTitle = $('[data-qa="vacancy-title"]').first().text().trim()
  const qaDescription = $('[data-qa="vacancy-description"]').first().text().trim()
  const qaSalary = $('[data-qa="vacancy-salary"]').first().text().trim()
  const qaExperience = $('[data-qa="vacancy-experience"]').first().text().trim()
  const qaEmployment = $('[data-qa="common-employment-text"]').first().text().trim()
  const qaWorkFormat = $('[data-qa="work-formats-text"]').first().text().trim()
  const qaAddress = $('[data-qa="vacancy-view-raw-address"]').first().text().trim()
  const qaScheduleDays = $('[data-qa="work-schedule-by-days-text"]').first().text().trim()
  const qaWorkingHours = $('[data-qa="working-hours-text"]').first().text().trim()
  const qaSkills: string[] = []
  $('[data-qa="skills-element"]').each((_, el) => {
    const s = $(el).text().trim()
    if (s) qaSkills.push(s)
  })

  // ─── Title: data-qa → <title> fallback ─────────────────────────────────
  let title = qaTitle
  if (!title) {
    const t = $("title").text().trim()
    title = t.replace(/\s+[—-]\s+Работа в.*$/i, "").replace(/\s+\(.*\)\s*$/, "").trim()
  }

  // ─── Description: data-qa block (cheerio handles nesting) ──────────────
  const description = qaDescription

  // ─── Salary: data-qa salary text preferred (has thousands separators) ──
  const salaryText = qaSalary || metaSalary
  const fromMatch = salaryText.match(/от\s*([\d\s\u00A0]+)/i)
  const toMatch = salaryText.match(/до\s*([\d\s\u00A0]+)/i)
  const salaryFrom = parseNumber(fromMatch?.[1])
  const salaryTo = parseNumber(toMatch?.[1])
  const salaryCurrency = detectCurrency(salaryText)

  // ─── Experience: data-qa → meta fallback ───────────────────────────────
  const experience = mapExperience(qaExperience || metaExperienceText)

  // ─── Employment: data-qa → meta fallback ───────────────────────────────
  const employment = mapEmployment(qaEmployment || metaEmploymentText)

  // ─── Schedule: work-formats → schedule-by-days → working-hours ─────────
  const schedule =
    mapSchedule(qaWorkFormat) ||
    mapSchedule(qaScheduleDays) ||
    mapSchedule(qaWorkingHours)

  // ─── City: address data-qa → meta fallback ─────────────────────────────
  let city = qaAddress
  if (!city) {
    // Try the breadcrumb area name often present near title
    city = $('[data-qa="vacancy-view-location"]').first().text().trim()
  }
  if (!city) city = metaCity

  return {
    title,
    description,
    salaryFrom,
    salaryTo,
    salaryCurrency,
    experience,
    employment,
    schedule,
    city,
    skills: qaSkills,
    specialization: "",
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!existing) {
      return apiError("Vacancy not found", 404)
    }

    const body = await req.json() as { hhUrl?: string }
    const hhUrl = body.hhUrl?.trim()
    if (!hhUrl) {
      return apiError("hhUrl is required", 400)
    }

    const match = hhUrl.match(/vacancy\/(\d+)/)
    if (!match) {
      return apiError("Invalid hh.ru vacancy URL", 400)
    }
    const hhVacancyId = match[1]

    const res = await fetch(`https://hh.ru/vacancy/${hhVacancyId}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.9",
      },
      redirect: "follow",
    })

    if (!res.ok) {
      return apiError(`Failed to fetch hh.ru vacancy (${res.status})`, 502)
    }

    const html = await res.text()
    const mappedData = parseHhHtml(html)
    mappedData.city = extractCityName(mappedData.city)
    console.log("[hh-import] HH parsed:", JSON.stringify(mappedData, null, 2))

    if (!mappedData.title && !mappedData.description) {
      return apiError("Не удалось извлечь данные со страницы hh.ru", 422)
    }

    // Split description → responsibilities + requirements via AI (falls back
    // to description-in-responsibilities if Anthropic unavailable).
    const split = mappedData.description
      ? await splitDescriptionWithAi(mappedData.description)
      : null
    const anketaResponsibilities = split?.responsibilities || mappedData.description
    const anketaRequirements = split?.requirements || ""
    console.log("[hh-import] AI split:", split ? "ok" : "fallback")

    // ─── Map HH values → anketa schema (Russian labels / schema ids) ────────
    const EMPLOYMENT_TO_ANKETA: Record<string, string> = {
      full: "Полная",
      part: "Частичная",
      project: "Проектная",
      probation: "Проектная",
    }
    const EXPERIENCE_TO_ANKETA: Record<string, string> = {
      noExperience: "none",
      between1And3: "1-3",
      between3And6: "3-6",
      moreThan6: "6+",
    }
    const SCHEDULE_TO_ANKETA: Record<string, string> = {
      fullDay: "5/2",
      shift: "shift",
      flexible: "free",
      flyInFlyOut: "rotation",
      remote: "free",
    }
    const anketaEmployment = mappedData.employment && EMPLOYMENT_TO_ANKETA[mappedData.employment]
      ? [EMPLOYMENT_TO_ANKETA[mappedData.employment]]
      : []
    const anketaRequiredExperience = mappedData.experience
      ? (EXPERIENCE_TO_ANKETA[mappedData.experience] ?? "")
      : ""
    const anketaSchedule = mappedData.schedule
      ? (SCHEDULE_TO_ANKETA[mappedData.schedule] ?? "")
      : ""
    const anketaWorkFormats = mappedData.schedule === "remote"
      ? ["Удалёнка"]
      : mappedData.schedule === "flyInFlyOut"
        ? ["Вахта"]
        : mappedData.city
          ? ["Офис"]
          : []

    // ─── Merge into existing descriptionJson.anketa ─────────────────────────
    const existingDescJson = (existing.descriptionJson as Record<string, unknown>) || {}
    const existingAnketa = (existingDescJson.anketa as Record<string, unknown>) || {}
    const newAnketa: Record<string, unknown> = {
      ...existingAnketa,
      ...(mappedData.title ? { vacancyTitle: mappedData.title } : {}),
      ...(mappedData.city ? { positionCity: mappedData.city } : {}),
      ...(anketaResponsibilities ? { responsibilities: anketaResponsibilities } : {}),
      ...(anketaRequirements ? { requirements: anketaRequirements } : {}),
      ...(mappedData.skills.length ? { requiredSkills: mappedData.skills } : {}),
      ...(mappedData.salaryFrom !== null ? { salaryFrom: String(mappedData.salaryFrom) } : {}),
      ...(mappedData.salaryTo !== null ? { salaryTo: String(mappedData.salaryTo) } : {}),
      ...(anketaEmployment.length ? { employment: anketaEmployment } : {}),
      ...(anketaRequiredExperience ? { requiredExperience: anketaRequiredExperience } : {}),
      ...(anketaSchedule ? { schedule: anketaSchedule } : {}),
      ...(anketaWorkFormats.length ? { workFormats: anketaWorkFormats } : {}),
    }

    const now = new Date()
    const updates: Record<string, unknown> = {
      hhVacancyId,
      hhUrl,
      hhSyncedAt: now,
      updatedAt: now,
      descriptionJson: { ...existingDescJson, anketa: newAnketa },
    }

    if (mappedData.title) updates.title = mappedData.title
    if (mappedData.description) updates.description = mappedData.description
    if (mappedData.city) updates.city = mappedData.city
    if (mappedData.salaryFrom !== null) updates.salaryMin = mappedData.salaryFrom
    if (mappedData.salaryTo !== null) updates.salaryMax = mappedData.salaryTo
    if (anketaRequiredExperience) updates.requiredExperience = anketaRequiredExperience
    if (anketaSchedule) updates.schedule = anketaSchedule
    if (anketaEmployment.length) updates.employment = anketaEmployment[0]

    console.log("[hh-import] DB updates:", JSON.stringify(updates, null, 2))

    const [updated] = await db
      .update(vacancies)
      .set(updates)
      .where(eq(vacancies.id, id))
      .returning()

    logActivity({
      companyId: user.companyId,
      userId: user.id!,
      action: "update",
      entityType: "vacancy",
      entityId: id,
      entityTitle: updated.title,
      module: "hr",
      details: { source: "hh_import", hhVacancyId },
      request: req,
    })

    return apiSuccess({ success: true, data: mappedData })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-import]", err)
    return apiError("Internal server error", 500)
  }
}
