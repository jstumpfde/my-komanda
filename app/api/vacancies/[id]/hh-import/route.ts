import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function findFirst(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m ? m[1] : null
}

function findAll(html: string, re: RegExp): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")
  while ((m = g.exec(html))) out.push(m[1])
  return out
}

// ─── JSON-LD (schema.org/JobPosting) ──────────────────────────────────────────

type JsonLdJob = {
  "@type"?: string | string[]
  title?: string
  description?: string
  baseSalary?: {
    currency?: string
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string }
  }
  experienceRequirements?: string
  employmentType?: string | string[]
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } } | Array<{ address?: { addressLocality?: string; addressRegion?: string } }>
  skills?: string | string[]
  occupationalCategory?: string
  industry?: string
}

function isJobPosting(node: unknown): node is JsonLdJob {
  if (!node || typeof node !== "object") return false
  const t = (node as JsonLdJob)["@type"]
  if (Array.isArray(t)) return t.includes("JobPosting")
  return t === "JobPosting"
}

function extractJsonLd(html: string): JsonLdJob | null {
  const blocks = findAll(html, /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of blocks) {
    try {
      const raw = JSON.parse(block.trim())
      const nodes: unknown[] = Array.isArray(raw) ? raw : raw["@graph"] && Array.isArray(raw["@graph"]) ? raw["@graph"] : [raw]
      for (const n of nodes) {
        if (isJobPosting(n)) return n
      }
    } catch {
      // skip malformed blocks
    }
  }
  return null
}

// ─── Mappers: schema.org → HH ids ─────────────────────────────────────────────

function mapEmploymentFromSchema(v: string | string[] | undefined): string {
  const val = Array.isArray(v) ? v[0] : v
  if (!val) return ""
  const up = val.toUpperCase()
  if (up.includes("FULL")) return "full"
  if (up.includes("PART")) return "part"
  if (up.includes("CONTRACT") || up.includes("TEMPORARY")) return "project"
  if (up.includes("INTERN")) return "probation"
  return ""
}

function mapExperienceFromText(text: string | undefined): string {
  if (!text) return ""
  const t = text.toLowerCase()
  if (/без опыта|no experience|not required/.test(t)) return "noExperience"
  if (/более 6|от 6|свыше 6|more than 6/.test(t)) return "moreThan6"
  if (/от 3|3–6|3-6|between 3 and 6/.test(t)) return "between3And6"
  if (/от 1|1–3|1-3|between 1 and 3/.test(t)) return "between1And3"
  return ""
}

function mapScheduleFromText(text: string | undefined): string {
  if (!text) return ""
  const t = text.toLowerCase()
  if (/удал[её]нн|remote/.test(t)) return "remote"
  if (/гибкий|flexible/.test(t)) return "flexible"
  if (/сменн|shift/.test(t)) return "shift"
  if (/вахт|fly.in/.test(t)) return "flyInFlyOut"
  if (/полный день|full.?day/.test(t)) return "fullDay"
  return ""
}

// ─── HTML body extractors (data-qa attributes) ────────────────────────────────

function extractByDataQa(html: string, qa: string): string | null {
  const re = new RegExp(
    `<([a-z0-9]+)[^>]*data-qa=["'][^"']*\\b${qa.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i"
  )
  const m = html.match(re)
  return m ? m[2] : null
}

function extractSkills(html: string): string[] {
  // Pull tag text from elements marked data-qa="bloko-tag__text" or "skills-element"
  const tags = findAll(
    html,
    /data-qa=["'][^"']*(?:bloko-tag__text|skills-element)[^"']*["'][^>]*>([\s\S]*?)</gi
  )
  const unique = new Set<string>()
  for (const t of tags) {
    const clean = decodeEntities(t.replace(/<[^>]+>/g, "")).trim()
    if (clean) unique.add(clean)
  }
  return [...unique]
}

// ─── Parser entry ─────────────────────────────────────────────────────────────

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
  const jsonLd = extractJsonLd(html)

  const salaryVal = jsonLd?.baseSalary?.value
  const currency = jsonLd?.baseSalary?.currency || ""

  // Title: JSON-LD first, <title> fallback
  let title = jsonLd?.title?.trim() || ""
  if (!title) {
    const t = findFirst(html, /<title>([^<]*)<\/title>/i)
    if (t) title = decodeEntities(t).replace(/\s+[—-]\s+Работа в.*$/i, "").replace(/\s+\(.*\)$/, "").trim()
  }

  // Description: JSON-LD first, DOM block fallback
  let descriptionHtml = jsonLd?.description || ""
  if (!descriptionHtml) {
    descriptionHtml = extractByDataQa(html, "vacancy-description") || ""
  }
  const description = descriptionHtml ? stripHtml(descriptionHtml) : ""

  // Experience: JSON-LD text → HH id, fallback DOM
  const experienceText =
    jsonLd?.experienceRequirements ||
    (extractByDataQa(html, "vacancy-experience")
      ? stripHtml(extractByDataQa(html, "vacancy-experience")!)
      : "")
  const experience = mapExperienceFromText(experienceText)

  // Employment + schedule: JSON-LD employmentType, DOM employment-mode block
  const employmentModeText = extractByDataQa(html, "vacancy-view-employment-mode")
    ? stripHtml(extractByDataQa(html, "vacancy-view-employment-mode")!)
    : ""
  const employment =
    mapEmploymentFromSchema(jsonLd?.employmentType) ||
    mapEmploymentFromSchema(employmentModeText)
  const schedule = mapScheduleFromText(employmentModeText) || mapScheduleFromText(jsonLd?.employmentType as string | undefined)

  // City: JSON-LD addressLocality
  let city = ""
  const loc = jsonLd?.jobLocation
  const first = Array.isArray(loc) ? loc[0] : loc
  if (first?.address?.addressLocality) city = first.address.addressLocality

  // Skills: JSON-LD skills OR DOM bloko tags
  let skills: string[] = []
  if (Array.isArray(jsonLd?.skills)) {
    skills = jsonLd!.skills.map(s => String(s).trim()).filter(Boolean)
  } else if (typeof jsonLd?.skills === "string" && jsonLd.skills.trim()) {
    skills = jsonLd.skills.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  }
  if (skills.length === 0) skills = extractSkills(html)

  // Specialization
  const specialization = jsonLd?.occupationalCategory?.trim() || jsonLd?.industry?.trim() || ""

  return {
    title,
    description,
    salaryFrom: typeof salaryVal?.minValue === "number" ? salaryVal.minValue : typeof salaryVal?.value === "number" ? salaryVal.value : null,
    salaryTo: typeof salaryVal?.maxValue === "number" ? salaryVal.maxValue : null,
    salaryCurrency: currency,
    experience,
    employment,
    schedule,
    city,
    skills,
    specialization,
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
      .select({ id: vacancies.id })
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

    if (!mappedData.title && !mappedData.description) {
      return apiError("Не удалось извлечь данные со страницы hh.ru", 422)
    }

    const now = new Date()
    const updates: Record<string, unknown> = {
      hhVacancyId,
      hhUrl,
      hhSyncedAt: now,
      updatedAt: now,
    }

    if (mappedData.title) updates.title = mappedData.title
    if (mappedData.description) updates.description = mappedData.description
    if (mappedData.city) updates.city = mappedData.city
    if (mappedData.employment) updates.employment = mappedData.employment
    if (mappedData.schedule) updates.schedule = mappedData.schedule
    if (mappedData.salaryFrom !== null) updates.salaryMin = mappedData.salaryFrom
    if (mappedData.salaryTo !== null) updates.salaryMax = mappedData.salaryTo
    if (mappedData.experience) updates.requiredExperience = mappedData.experience

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
