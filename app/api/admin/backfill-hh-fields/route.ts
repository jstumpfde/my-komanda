import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull, isNotNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, hhResponses, vacancies } from "@/lib/db/schema"
import { auth } from "@/auth"
import { getValidToken } from "@/lib/hh-helpers"
import { fetchHhResume } from "@/lib/hh-api"
import { extractHhResumeFields, toCandidateColumns } from "@/lib/hh/extract-resume-fields"

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

interface ResumeShape {
  resume?: Record<string, unknown> | null
  // некоторые рекорды лежат с разложенным резюме на верхнем уровне
  [key: string]: unknown
}

function pickResumePart(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as ResumeShape
  if (o.resume && typeof o.resume === "object") return o.resume as Record<string, unknown>
  // если на верхнем уровне есть характерные ключи — раскладываем как резюме
  if ("birth_date" in o || "age" in o || "skill_set" in o || "total_experience" in o) {
    return o as Record<string, unknown>
  }
  return null
}

async function fetchWithRetry(token: string, resumeId: string): Promise<Awaited<ReturnType<typeof fetchHhResume>> | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchHhResume(token, resumeId)
      // 200ms throttle между запросами hh
      await sleep(200)
      return r
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("429")) {
        await sleep(5000)
        continue
      }
      console.warn(`[backfill-hh] resume ${resumeId} attempt ${attempt + 1} failed:`, msg)
      await sleep(1000)
    }
  }
  return null
}

// POST /api/admin/backfill-hh-fields
// Body: { vacancyId?: string, dryRun?: boolean, limit?: number }
//
// Доступ: только platform_admin или director (роль компании).
//
// Логика для каждого hh-кандидата без birth_date / experienceYears (или
// со всеми пустыми расширенными полями) и без anketaAnswers:
// 1. Берём raw из hh_responses (поиск по local_candidate_id).
// 2. Если в raw нет полного резюме (нет birth_date/age) — пробуем дёрнуть hh API
//    через resume.id (если он сохранён в raw).
// 3. Парсим через extractHhResumeFields → UPDATE candidates SET ... WHERE id=...
// 4. НЕ перезаписываем заполненные поля и не трогаем кандидатов с anketaAnswers.
export async function POST(req: NextRequest) {
  const session = await auth()
  const userRole = session?.user?.role
  const isAdmin = userRole === "platform_admin" || userRole === "admin" || userRole === "director"
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    vacancyId?: string
    dryRun?:    boolean
    limit?:     number
  }
  const dryRun = !!body.dryRun
  const hardLimit = Math.min(Math.max(Number(body.limit) || 1000, 1), 5000)

  // Целевые кандидаты: source='hh', anketaAnswers IS NULL, без даты рождения
  // (или без experienceYears — на случай если birth_date был угадан).
  // Берём всех hh-кандидатов где не хватает данных (даже с заполненной анкетой —
  // в анкете может не быть даты рождения, а в hh-резюме есть)
  const conditions = [
    eq(candidates.source, "hh"),
    isNull(candidates.birthDate),
  ]
  if (body.vacancyId) conditions.push(eq(candidates.vacancyId, body.vacancyId))

  const targets = await db
    .select({
      id:          candidates.id,
      vacancyId:   candidates.vacancyId,
      name:        candidates.name,
      birthDate:   candidates.birthDate,
      experienceYears: candidates.experienceYears,
    })
    .from(candidates)
    .where(and(...conditions))
    .limit(hardLimit)

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, total: 0, updated: 0, dryRun })
  }

  // Найдём hh_responses для этих кандидатов
  const candIds = targets.map(t => t.id)
  const responses = await db
    .select({
      id:               hhResponses.id,
      companyId:        hhResponses.companyId,
      localCandidateId: hhResponses.localCandidateId,
      rawData:          hhResponses.rawData,
    })
    .from(hhResponses)
    .where(and(
      isNotNull(hhResponses.localCandidateId),
      inArray(hhResponses.localCandidateId, candIds),
    ))

  const respByCand = new Map<string, typeof responses[number]>()
  for (const r of responses) {
    if (r.localCandidateId) respByCand.set(r.localCandidateId, r)
  }

  // Кэш токенов по companyId — чтобы не дёргать БД на каждой итерации
  const tokenCache = new Map<string, string | null>()
  async function getToken(companyId: string): Promise<string | null> {
    if (tokenCache.has(companyId)) return tokenCache.get(companyId)!
    const t = await getValidToken(companyId)
    const accessToken = t?.accessToken ?? null
    tokenCache.set(companyId, accessToken)
    return accessToken
  }

  let updated = 0
  let withResume = 0
  let withApi = 0
  let skipped = 0
  const errors: Array<{ candidateId: string; reason: string }> = []

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    if (i % 50 === 0) console.log(`[backfill-hh] прогресс ${i}/${targets.length}, обновлено ${updated}`)

    const resp = respByCand.get(t.id)
    let resumeRaw: Record<string, unknown> | null = resp ? pickResumePart(resp.rawData) : null

    // Если в raw нет полного резюме — пробуем hh API
    if (!resumeRaw || (!resumeRaw["birth_date"] && resumeRaw["age"] === undefined)) {
      const resumeId = (resumeRaw?.["id"] as string | undefined)
        ?? ((resp?.rawData as { resume?: { id?: string } } | null)?.resume?.id)
      if (resp && resumeId) {
        const token = await getToken(resp.companyId)
        if (token) {
          const full = await fetchWithRetry(token, resumeId)
          if (full) {
            resumeRaw = full as Record<string, unknown>
            withApi++
          }
        }
      }
    } else {
      withResume++
    }

    if (!resumeRaw) { skipped++; continue }

    const extracted = extractHhResumeFields(resumeRaw)
    const cols = toCandidateColumns(extracted)

    // Не пишем в legacy `experience` если у нас нет experienceYears
    // (чтобы не зануливать поле текстом "0 лет"), и не записываем поля,
    // которые уже были; за это отвечает дополнительная проверка ниже.

    if (Object.keys(cols).length === 0) { skipped++; continue }

    if (!dryRun) {
      try {
        // Подгружаем актуальные значения колонок этого кандидата и пишем только пустые
        const [cur] = await db.select({
          birthDate:          candidates.birthDate,
          experienceYears:    candidates.experienceYears,
          educationLevel:     candidates.educationLevel,
          workFormat:         candidates.workFormat,
          keySkills:          candidates.keySkills,
          skills:             candidates.skills,
          languages:          candidates.languages,
          relocationReady:    candidates.relocationReady,
          businessTripsReady: candidates.businessTripsReady,
          salaryMin:          candidates.salaryMin,
          salaryMax:          candidates.salaryMax,
          city:               candidates.city,
          experience:         candidates.experience,
          photoUrl:           candidates.photoUrl,
        }).from(candidates).where(eq(candidates.id, t.id)).limit(1)
        if (!cur) { skipped++; continue }

        const setFields: Record<string, unknown> = { updatedAt: new Date() }
        for (const [k, v] of Object.entries(cols)) {
          const cv = (cur as Record<string, unknown>)[k]
          const empty =
            cv === null || cv === undefined ||
            (Array.isArray(cv) && cv.length === 0) ||
            (typeof cv === "string" && cv.trim() === "")
          if (empty) setFields[k] = v
        }
        // Если кроме updatedAt ничего не добавили — нечего писать
        if (Object.keys(setFields).length > 1) {
          await db.update(candidates).set(setFields).where(eq(candidates.id, t.id))
          updated++
        }
      } catch (err) {
        errors.push({ candidateId: t.id, reason: err instanceof Error ? err.message : String(err) })
      }
    } else {
      updated++
    }
  }

  // Покажем краткое распределение по вакансии (для удобства проверки)
  let vacancySummary: Array<{ vacancyId: string; title: string | null; targets: number }> = []
  try {
    const vacIds = Array.from(new Set(targets.map(t => t.vacancyId)))
    if (vacIds.length > 0) {
      const vrows = await db.select({ id: vacancies.id, title: vacancies.title })
        .from(vacancies).where(inArray(vacancies.id, vacIds))
      const titleById = new Map(vrows.map(r => [r.id, r.title ?? null] as const))
      vacancySummary = vacIds.map(vid => ({
        vacancyId: vid,
        title: titleById.get(vid) ?? null,
        targets: targets.filter(t => t.vacancyId === vid).length,
      }))
    }
  } catch {/* ignore */}

  return NextResponse.json({
    ok:          true,
    total:       targets.length,
    updated,
    skipped,
    withResume,
    withApi,
    errors:      errors.slice(0, 10),
    errorsCount: errors.length,
    vacancySummary,
    dryRun,
  })
}
