import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import * as cheerio from "cheerio"
import { db } from "@/lib/db"
import { vacancies, hhVacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const SPLIT_PROMPT = `Раздели текст описания вакансии на две части:
1. Обязанности — что сотрудник будет делать (задачи, функционал, зоны ответственности)
2. Требования — что должен знать и уметь кандидат (опыт, навыки, образование, личные качества)

Верни JSON: { "responsibilities": "текст обязанностей", "requirements": "текст требований" }
Каждый пункт на новой строке, начинается с —. Без нумерации. Только JSON, без markdown.`

async function splitDescriptionWithAi(description: string): Promise<{ responsibilities: string; requirements: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SPLIT_PROMPT,
        messages: [{ role: "user", content: description }],
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error("[hh-import] AI split HTTP", res.status, err.slice(0, 300))
      return null
    }
    const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
    const textBlock = data.content?.find(b => b.type === "text")
    const text = textBlock?.text || ""
    if (!text) return null
    const raw = text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
    let parsed: { responsibilities?: string; requirements?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
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
  cityFull: string          // полный адрес/регион без обрезки по запятой
  skills: string[]
  specialization: string
  category: string
  languages: { lang: string; level: string }[]  // языки из страницы вакансии
  driverLicenseTypes: string[]                  // водительские права (категории)
  department: string                            // отдел
  workingDays: string                           // детализация рабочих дней (hh text)
  workingTimeIntervals: string                  // детализация часов (hh text)
  acceptHandicapped: boolean                    // спец.условие: инвалидность
  acceptKids: boolean                           // спец.условие: несовершеннолетние
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

  // ─── Языки (languages) ─────────────────────────────────────────────────
  // hh показывает языки в блоке data-qa="vacancy-view-language-*" или общем
  // контейнере с заголовком «Знание языков». Пробуем несколько селекторов.
  const qaLanguages: { lang: string; level: string }[] = []
  $('[data-qa^="vacancy-view-language"]').each((_, el) => {
    const text = $(el).text().trim()
    if (!text) return
    // Формат: «Английский — B2» или «Английский: B2»
    const m = text.match(/^([^—:–]+)[—:–]\s*(.+)$/)
    if (m) {
      qaLanguages.push({ lang: m[1].trim(), level: m[2].trim() })
    } else {
      qaLanguages.push({ lang: text, level: "" })
    }
  })
  // Дополнительный поиск: контейнер с заголовком «Знание языков»
  if (qaLanguages.length === 0) {
    $("*").filter((_, el) => $(el).children().length === 0 && /знание языков/i.test($(el).text())).each((_, labelEl) => {
      $(labelEl).parent().find("*").filter((_, el) => $(el).children().length === 0).each((_, el) => {
        const text = $(el).text().trim()
        if (!text || /знание языков/i.test(text)) return
        const m = text.match(/^([^—:–]+)[—:–]\s*(.+)$/)
        if (m) qaLanguages.push({ lang: m[1].trim(), level: m[2].trim() })
        else if (text.length < 60) qaLanguages.push({ lang: text, level: "" })
      })
    })
  }

  // ─── Водительские права ────────────────────────────────────────────────
  // hh отображает категории прав в виде бэджей или текста «Водительские права: B»
  const qaDrivingLicense: string[] = []
  $('[data-qa*="driver-license"], [data-qa*="driving-license"]').each((_, el) => {
    const t = $(el).text().trim()
    if (t) qaDrivingLicense.push(t)
  })
  if (qaDrivingLicense.length === 0) {
    // Fallback: ищем текст «Водительское удостоверение» / «Водительские права»
    const bodyText = $("body").text()
    const drMatch = bodyText.match(/[Вв]одительск(?:ое удостоверение|ие права)[:\s]+([A-Za-zА-Яа-я,\s]+?)(?:\n|\.|\d|$)/m)
    if (drMatch) {
      const cats = drMatch[1].split(/[,\s]+/).map(s => s.trim()).filter(s => /^[A-Za-z]$/.test(s))
      qaDrivingLicense.push(...cats)
    }
  }

  // ─── Отдел (department) ────────────────────────────────────────────────
  const qaDepartment = $('[data-qa="vacancy-company-department"]').first().text().trim()
    || $('[data-qa*="department"]').first().text().trim()

  // ─── Спец. условия (accept_handicapped, accept_kids) ───────────────────
  const bodyHtml = $("body").html() || ""
  const qaAcceptHandicapped = /инвалид|ОВЗ|ограниченн[ыeё][мх]? возможност/i.test(bodyHtml)
  const qaAcceptKids = /несовершеннолетн|до 18 лет/i.test(bodyHtml)

  // ─── Professional roles / category ─────────────────────────────────────
  // hh.ru отображает профроль в нескольких возможных местах:
  // 1. [data-qa="vacancy-professional-roles-text"] — основной блок
  // 2. [data-qa="vacancy-serp__vacancy_professional-role"] — листинг (на странице вакансии есть)
  // 3. Хлебные крошки — предпоследний элемент перед названием вакансии
  let qaCategory = $('[data-qa="vacancy-professional-roles-text"]').first().text().trim()
  if (!qaCategory) {
    qaCategory = $('[data-qa="vacancy-serp__vacancy_professional-role"]').first().text().trim()
  }
  if (!qaCategory) {
    // Попытка извлечь из хлебных крошек: последний перед заголовком
    const crumbs: string[] = []
    $('[data-qa="breadcrumbs"] a, .bloko-breadcrumb a').each((_, el) => {
      const t = $(el).text().trim()
      if (t) crumbs.push(t)
    })
    if (crumbs.length >= 2) {
      // Хлебные крошки: Главная → ... → Профобласть → Название вакансии
      qaCategory = crumbs[crumbs.length - 1]
    }
  }

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
    cityFull: city,   // сохраняем полный адрес до extractCityName
    skills: qaSkills,
    specialization: "",
    category: qaCategory,
    languages: qaLanguages,
    driverLicenseTypes: qaDrivingLicense,
    department: qaDepartment,
    workingDays: qaScheduleDays,
    workingTimeIntervals: qaWorkingHours,
    acceptHandicapped: qaAcceptHandicapped,
    acceptKids: qaAcceptKids,
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
      .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson, status: vacancies.status })
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

    // ─── Маппинг языков hh → aiLanguages (id+уровень) ──────────────────────
    // hh показывает текстовые лейблы вида «Английский — B2». Конвертируем в hh-id
    // (eng/deu/fra/…) и уровень (a1..c2/l1). Если язык не распознан — пропускаем.
    const LANG_LABEL_TO_ID: Record<string, string> = {
      "английский": "eng", "немецкий": "deu", "французский": "fra",
      "испанский": "spa", "итальянский": "ita", "китайский": "zho",
      "польский": "pol", "португальский": "por", "японский": "jpn",
      "арабский": "ara", "корейский": "kor", "турецкий": "tur",
      "нидерландский": "nld", "шведский": "swe", "финский": "fin",
      "чешский": "ces", "венгерский": "hun", "румынский": "ron",
    }
    const LEVEL_LABEL_TO_ID: Record<string, string> = {
      "a1": "a1", "a2": "a2", "b1": "b1", "b2": "b2", "c1": "c1", "c2": "c2",
      "родной": "l1", "native": "l1",
      "начальный": "a1", "элементарный": "a2", "средний": "b1",
      "средне-продвинутый": "b2", "продвинутый": "c1", "в совершенстве": "c2",
    }
    const anketaLanguages = mappedData.languages
      .map(({ lang, level }) => {
        const langId = LANG_LABEL_TO_ID[lang.toLowerCase().trim()]
        if (!langId) return null
        const levelId = LEVEL_LABEL_TO_ID[level.toLowerCase().trim()] || ""
        return { lang: langId, level: levelId }
      })
      .filter((l): l is { lang: string; level: string } => l !== null)

    // ─── Merge into existing descriptionJson.anketa ─────────────────────────
    const existingDescJson = (existing.descriptionJson as Record<string, unknown>) || {}
    const existingAnketa = (existingDescJson.anketa as Record<string, unknown>) || {}

    // Специальные условия — строковый список для хранения в anketa
    const specialConditions: string[] = []
    if (mappedData.acceptHandicapped) specialConditions.push("Открыты для кандидатов с ОВЗ")
    if (mappedData.acceptKids) specialConditions.push("Трудоустройство несовершеннолетних")

    const newAnketa: Record<string, unknown> = {
      ...existingAnketa,
      ...(mappedData.title ? { vacancyTitle: mappedData.title } : {}),
      ...(mappedData.city ? { positionCity: mappedData.city } : {}),
      // Полный регион/адрес (без обрезки по запятой) — в новое поле positionCityFull
      ...(mappedData.cityFull && mappedData.cityFull !== mappedData.city
        ? { positionCityFull: mappedData.cityFull } : {}),
      ...(anketaResponsibilities ? { responsibilities: anketaResponsibilities } : {}),
      ...(anketaRequirements ? { requirements: anketaRequirements } : {}),
      ...(mappedData.skills.length ? { requiredSkills: mappedData.skills } : {}),
      ...(mappedData.salaryFrom !== null ? { salaryFrom: String(mappedData.salaryFrom) } : {}),
      ...(mappedData.salaryTo !== null ? { salaryTo: String(mappedData.salaryTo) } : {}),
      ...(anketaEmployment.length ? { employment: anketaEmployment } : {}),
      ...(anketaRequiredExperience ? { requiredExperience: anketaRequiredExperience } : {}),
      ...(anketaSchedule ? { schedule: anketaSchedule } : {}),
      ...(anketaWorkFormats.length ? { workFormats: anketaWorkFormats } : {}),
      ...(mappedData.category ? { vacancyCategory: mappedData.category } : {}),
      // Новые поля из hh (10.06)
      ...(anketaLanguages.length ? { aiLanguages: anketaLanguages } : {}),
      ...(mappedData.driverLicenseTypes.length ? { driverLicenseTypes: mappedData.driverLicenseTypes } : {}),
      ...(mappedData.department ? { department: mappedData.department } : {}),
      ...(mappedData.workingDays ? { workingDaysText: mappedData.workingDays } : {}),
      ...(mappedData.workingTimeIntervals ? { workingTimeText: mappedData.workingTimeIntervals } : {}),
      ...(specialConditions.length ? { specialConditions } : {}),
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
    if (mappedData.category) updates.category = mappedData.category
    if (anketaEmployment.length) updates.employment = anketaEmployment[0]

    console.log("[hh-import] DB updates:", JSON.stringify(updates, null, 2))

    const [updated] = await db
      .update(vacancies)
      .set(updates)
      .where(eq(vacancies.id, id))
      .returning()

    // ─── Sync hh_vacancies (upsert) so UI считает вакансию подключённой ────
    // Для черновиков (status=draft) НЕ проставляем localVacancyId:
    // черновик ещё не готов, HR подключит источник сам когда вакансия будет готова.
    // Для уже опубликованных/активных вакансий — связываем как раньше.
    const isDraft = existing.status === "draft"
    const hhValues = {
      companyId:       user.companyId,
      hhVacancyId,
      title:           mappedData.title || updated.title,
      areaName:        mappedData.city || null,
      salaryFrom:      mappedData.salaryFrom,
      salaryTo:        mappedData.salaryTo,
      salaryCurrency:  mappedData.salaryCurrency || null,
      status:          "active",
      url:             hhUrl,
      localVacancyId:  isDraft ? null : id,
      rawData:         mappedData as unknown as Record<string, unknown>,
      syncedAt:        now,
    }
    await db
      .insert(hhVacancies)
      .values(hhValues)
      .onConflictDoUpdate({
        target: [hhVacancies.companyId, hhVacancies.hhVacancyId],
        set: {
          title:          hhValues.title,
          areaName:       hhValues.areaName,
          salaryFrom:     hhValues.salaryFrom,
          salaryTo:       hhValues.salaryTo,
          salaryCurrency: hhValues.salaryCurrency,
          status:         hhValues.status,
          url:            hhValues.url,
          localVacancyId: hhValues.localVacancyId,
          rawData:        hhValues.rawData,
          syncedAt:       hhValues.syncedAt,
        },
      })

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
