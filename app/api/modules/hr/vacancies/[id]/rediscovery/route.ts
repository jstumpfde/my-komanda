/**
 * Rediscovery (F1): поиск подходящих кандидатов в базе компании для новой вакансии.
 *
 * POST /api/modules/hr/vacancies/[id]/rediscovery
 *   body: { action: "search" | "add", sourceCandidateIds?: string[] }
 *
 *   action="search" — поиск: префильтр SQL → текстовый ранжинг → AI-оценка батчами
 *   action="add"    — добавить sourceCandidateIds в эту вакансию (с дедупликацией)
 */

import { NextRequest } from "next/server"
import { and, eq, ne, isNull, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhCandidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { callClaudeHaiku } from "@/lib/ai/client"
import { getSpec } from "@/lib/core/spec/store"
import { buildSpecFromLegacy, type LegacyVacancyInput } from "@/lib/core/spec/from-legacy"
import { generateCandidateShortId } from "@/lib/short-id"
import type { CandidateSpec } from "@/lib/core/spec/types"
import { mustHaveTexts, niceToHaveTexts, dealBreakerTexts } from "@/lib/core/spec/types"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"

// ─── Константы ───────────────────────────────────────────────────────────────

/** Максимум кандидатов в префильтре */
const PREFILL_LIMIT = 500
/** Сколько попадает на AI-оценку */
const AI_TOP_LIMIT = 50
/** Размер батча для одного AI-вызова */
const AI_BATCH_SIZE = 10

// ─── Типы ───────────────────────────────────────────────────────────────────

interface RediscoveryCandidate {
  id:           string
  name:         string
  sourceVacancyId:   string
  sourceVacancyTitle: string
  skills:       string[]
  keySkills:    string[]
  experienceYears: number | null
  city:         string | null
  experience:   string | null
  aiScore:      number | null
  source:       string | null
}

interface ScoredCandidate {
  candidateId:        string
  name:               string
  sourceVacancyTitle: string
  sourceVacancyId:    string
  score:              number
  reason:             string
}

interface RediscoveryLastRun {
  ranAt:           string
  totalPrefill:    number
  totalAiScored:   number
  results:         ScoredCandidate[]
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

/** Строим список ключевых слов из Spec для текстового матчинга */
function buildKeywords(spec: CandidateSpec): string[] {
  const words: string[] = [
    ...mustHaveTexts(spec.mustHave),
    ...niceToHaveTexts(spec.niceToHave),
    ...spec.portraitRequiredSkills,
    ...spec.portraitNiceSkills,
  ]
  return words
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length > 2)
}

/** Текстовый скор: считаем совпадения навыков кандидата с ключевыми словами Spec */
function textScore(cand: RediscoveryCandidate, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const haystack = [
    ...(cand.skills ?? []),
    ...(cand.keySkills ?? []),
    cand.experience ?? "",
  ]
    .join(" ")
    .toLowerCase()
  return keywords.filter(kw => haystack.includes(kw)).length
}

/** Форматируем компактное резюме кандидата для AI */
function formatCandidateForAI(c: RediscoveryCandidate): string {
  const skills = [...new Set([...c.skills, ...c.keySkills])].slice(0, 20).join(", ")
  return [
    `Имя: ${c.name}`,
    `Опыт (лет): ${c.experienceYears ?? "—"}`,
    `Город: ${c.city ?? "—"}`,
    `Навыки: ${skills || "—"}`,
    `Резюме-опыт: ${c.experience ? c.experience.slice(0, 200) : "—"}`,
  ].join("; ")
}

/** Форматируем критерии Spec для промпта AI */
function formatSpecForAI(spec: CandidateSpec): string {
  const parts: string[] = []
  if (spec.mustHave.length)          parts.push(`Обязательно: ${mustHaveTexts(spec.mustHave).join(", ")}`)
  if (spec.niceToHave.length)        parts.push(`Желательно: ${niceToHaveTexts(spec.niceToHave).join(", ")}`)
  if (spec.dealBreakers.length)      parts.push(`Стоп-факторы: ${dealBreakerTexts(spec.dealBreakers).join(", ")}`)
  if (spec.portraitRequiredSkills.length) parts.push(`Ключевые навыки: ${spec.portraitRequiredSkills.join(", ")}`)
  if (spec.idealProfile)             parts.push(`Идеальный профиль: ${spec.idealProfile}`)
  return parts.join("\n") || "Критерии не заданы"
}

/** AI-оценка батча кандидатов. Возвращает Map<candidateId → {score, reason}> */
async function scoreBatch(
  batch: RediscoveryCandidate[],
  specText: string,
): Promise<Map<string, { score: number; reason: string }>> {
  const result = new Map<string, { score: number; reason: string }>()

  const candidatesText = batch
    .map((c, i) => `[${i + 1}] ID:${c.id}\n${formatCandidateForAI(c)}`)
    .join("\n\n")

  const prompt = `Ты — HR-ассистент. Оцени соответствие каждого кандидата требованиям вакансии.

ТРЕБОВАНИЯ ВАКАНСИИ:
${specText}

КАНДИДАТЫ (${batch.length} человек):
${candidatesText}

Верни JSON-массив объектов — РОВНО ${batch.length} элементов, в том же порядке:
[
  { "id": "...", "score": 0-100, "reason": "одна строка причины на русском" },
  ...
]

score: 0 — совсем не подходит, 100 — идеально подходит.
reason: максимум 100 символов, по-русски, конкретно (что совпало или чего не хватает).
Вернуть ТОЛЬКО валидный JSON без дополнительного текста.`

  let raw = ""
  try {
    raw = await callClaudeHaiku(prompt, undefined, 1200)
  } catch (err) {
    console.warn("[rediscovery] AI batch call failed:", err instanceof Error ? err.message : err)
    return result
  }

  // Извлекаем JSON из ответа
  const stripped = raw.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const m = stripped.match(/\[[\s\S]*\]/)
    if (!m) return result
    try { parsed = JSON.parse(m[0]) } catch { return result }
  }

  if (!Array.isArray(parsed)) return result

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const id    = typeof r.id    === "string" ? r.id    : null
    const score = typeof r.score === "number" ? Math.max(0, Math.min(100, Math.round(r.score))) : null
    const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 150) : "—"
    if (id && score !== null) {
      result.set(id, { score, reason })
    }
  }

  return result
}

// ─── Обработчики ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id: targetVacancyId } = await params

    // Проверяем вакансию и её принадлежность компании
    const [targetVacancy] = await db
      .select({
        id:                targetVacancyId,
        companyId:         vacancies.companyId,
        requirementsJson:  vacancies.requirementsJson,
        aiProcessSettings: vacancies.aiProcessSettings,
        stopFactorsJson:   vacancies.stopFactorsJson,
        descriptionJson:   vacancies.descriptionJson,
        title:             vacancies.title,
      })
      .from(vacancies)
      .where(and(
        eq(vacancies.id, targetVacancyId),
        eq(vacancies.companyId, user.companyId),
      ))
      .limit(1)

    if (!targetVacancy) return apiError("Вакансия не найдена", 404)

    let body: { action?: unknown; sourceCandidateIds?: unknown }
    try {
      body = await req.json()
    } catch {
      return apiError("Невалидный JSON", 400)
    }

    const action = body.action

    // ── action="add" ─────────────────────────────────────────────────────────
    if (action === "add") {
      const ids = Array.isArray(body.sourceCandidateIds)
        ? (body.sourceCandidateIds as unknown[]).filter((x): x is string => typeof x === "string")
        : []

      if (ids.length === 0) return apiError("sourceCandidateIds не задан", 400)
      if (ids.length > 100) return apiError("Максимум 100 кандидатов за раз", 400)

      // Читаем исходных кандидатов (они могут быть в другой вакансии той же компании)
      const sourceCands = await db
        .select({
          id:          candidates.id,
          name:        candidates.name,
          phone:       candidates.phone,
          email:       candidates.email,
          city:        candidates.city,
          source:      candidates.source,
          skills:      candidates.skills,
          keySkills:   candidates.keySkills,
          experience:  candidates.experience,
          experienceYears: candidates.experienceYears,
          workFormat:  candidates.workFormat,
          educationLevel: candidates.educationLevel,
          languages:   candidates.languages,
          industry:    candidates.industry,
          salaryMin:   candidates.salaryMin,
          salaryMax:   candidates.salaryMax,
          birthDate:   candidates.birthDate,
          photoUrl:    candidates.photoUrl,
          vacancyId:   candidates.vacancyId,
          aiScore:     candidates.aiScore,
          aiSummary:   candidates.aiSummary,
        })
        .from(candidates)
        .where(inArray(candidates.id, ids))

      // Проверяем что все они из вакансий этой компании
      if (sourceCands.length > 0) {
        const vacancyIds = [...new Set(sourceCands.map(c => c.vacancyId))]
        const allowedVacancies = await db
          .select({ id: vacancies.id })
          .from(vacancies)
          .where(and(
            inArray(vacancies.id, vacancyIds),
            eq(vacancies.companyId, user.companyId),
          ))
        const allowedIds = new Set(allowedVacancies.map(v => v.id))
        const unauthorized = sourceCands.filter(c => !allowedIds.has(c.vacancyId))
        if (unauthorized.length > 0) return apiError("Нет доступа к некоторым кандидатам", 403)
      }

      // Дедуп: ищем уже существующих в целевой вакансии по phone, email и hh_resume_id
      // (тот же подход, что в process-queue.ts)
      const existingInTarget = await db
        .select({ phone: candidates.phone, email: candidates.email, id: candidates.id })
        .from(candidates)
        .where(and(
          eq(candidates.vacancyId, targetVacancyId),
          isNull(candidates.deletedAt),
        ))

      const existingPhones = new Set(existingInTarget.map(c => c.phone).filter(Boolean))
      const existingEmails = new Set(existingInTarget.map(c => c.email).filter(Boolean))
      const existingCandIds = new Set(existingInTarget.map(c => c.id))

      // Также проверим hh_resume_id существующих кандидатов целевой вакансии
      const existingHhResumes = await db
        .select({ hhResumeId: hhCandidates.hhResumeId })
        .from(hhCandidates)
        .innerJoin(candidates, eq(candidates.id, hhCandidates.candidateId))
        .where(eq(candidates.vacancyId, targetVacancyId))
      const existingHhResumeIds = new Set(existingHhResumes.map(r => r.hhResumeId))

      // hh_resume_id источников
      const sourceHhMap = new Map<string, string>() // candidateId → hhResumeId
      if (sourceCands.length > 0) {
        const sourceHh = await db
          .select({ candidateId: hhCandidates.candidateId, hhResumeId: hhCandidates.hhResumeId })
          .from(hhCandidates)
          .where(inArray(hhCandidates.candidateId, sourceCands.map(c => c.id)))
        for (const row of sourceHh) sourceHhMap.set(row.candidateId, row.hhResumeId)
      }

      let created = 0
      let skipped = 0
      const createdIds: string[] = []

      for (const src of sourceCands) {
        // Дедуп
        const srcHhId = sourceHhMap.get(src.id)
        if (
          (src.phone && existingPhones.has(src.phone)) ||
          (src.email && existingEmails.has(src.email)) ||
          (srcHhId && existingHhResumeIds.has(srcHhId))
        ) {
          skipped++
          continue
        }

        const newToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
        const newCand = await db.transaction(async (tx) => {
          const short = await generateCandidateShortId(tx, targetVacancyId)
          const [row] = await tx.insert(candidates).values({
            vacancyId:      targetVacancyId,
            name:           src.name,
            phone:          src.phone,
            email:          src.email,
            city:           src.city,
            source:         "rediscovery",
            stage:          "new",
            skills:         src.skills ?? [],
            keySkills:      src.keySkills ?? [],
            experience:     src.experience,
            experienceYears: src.experienceYears,
            workFormat:     src.workFormat,
            educationLevel: src.educationLevel,
            languages:      src.languages ?? [],
            industry:       src.industry,
            salaryMin:      src.salaryMin,
            salaryMax:      src.salaryMax,
            birthDate:      src.birthDate,
            photoUrl:       src.photoUrl,
            token:          newToken,
            shortId:        short?.shortId ?? null,
            sequenceNumber: short?.sequenceNumber ?? null,
            // Ссылка на исходную вакансию — пишем в aiDetails как мета
            aiDetails:      [{ source_candidate_id: src.id, source_vacancy_id: src.vacancyId }],
          }).returning({ id: candidates.id })
          return row
        })

        if (newCand) {
          created++
          createdIds.push(newCand.id)
          // Обновляем дедуп-сеты
          if (src.phone) existingPhones.add(src.phone)
          if (src.email) existingEmails.add(src.email)
          if (srcHhId) existingHhResumeIds.add(srcHhId)
          existingCandIds.add(newCand.id)
        }
      }

      return apiSuccess({ created, skipped, createdIds })
    }

    // ── action="search" ──────────────────────────────────────────────────────
    if (action !== "search") {
      return apiError('action должен быть "search" или "add"', 400)
    }

    // 1. Получаем Spec для вакансии (из нового контура или legacy)
    let spec: CandidateSpec
    const specFromStore = await getSpec(targetVacancyId)
    if (specFromStore) {
      spec = specFromStore
    } else {
      const legacyInput: LegacyVacancyInput = {
        requirementsJson:  targetVacancy.requirementsJson as LegacyVacancyInput["requirementsJson"],
        aiProcessSettings: targetVacancy.aiProcessSettings as LegacyVacancyInput["aiProcessSettings"],
        stopFactorsJson:   targetVacancy.stopFactorsJson as LegacyVacancyInput["stopFactorsJson"],
        descriptionJson:   targetVacancy.descriptionJson as LegacyVacancyInput["descriptionJson"],
        postDemoSettings:  null,
      }
      spec = buildSpecFromLegacy(legacyInput)
    }

    // 2. Префильтр SQL: все кандидаты компании, кроме этой вакансии,
    //    не deleted, исключаем явных hard-reject'ов abuse (rejection_reason_category=abuse)
    const prefilteredRaw = await db
      .select({
        id:              candidates.id,
        name:            candidates.name,
        vacancyId:       candidates.vacancyId,
        skills:          candidates.skills,
        keySkills:       candidates.keySkills,
        experience:      candidates.experience,
        experienceYears: candidates.experienceYears,
        city:            candidates.city,
        aiScore:         candidates.aiScore,
        source:          candidates.source,
      })
      .from(candidates)
      .innerJoin(vacancies, and(
        eq(vacancies.id, candidates.vacancyId),
        eq(vacancies.companyId, user.companyId),
      ))
      .where(and(
        ne(candidates.vacancyId, targetVacancyId),
        isNull(candidates.deletedAt),
        // Исключить abuse-rejected
        sql`(${candidates.rejectionReasonCategory} IS NULL OR ${candidates.rejectionReasonCategory} != 'abuse')`,
      ))
      .orderBy(sql`${candidates.createdAt} DESC`)
      .limit(PREFILL_LIMIT)

    const totalPrefill = prefilteredRaw.length

    if (totalPrefill === 0) {
      // Сохраняем пустой результат
      const lastRun: RediscoveryLastRun = {
        ranAt: new Date().toISOString(),
        totalPrefill: 0,
        totalAiScored: 0,
        results: [],
      }
      await saveLastRun(targetVacancyId, targetVacancy.aiProcessSettings, lastRun)
      return apiSuccess({ totalPrefill: 0, totalAiScored: 0, results: [], ranAt: lastRun.ranAt })
    }

    // Получаем заголовки вакансий для отображения источника
    const vacancyIds = [...new Set(prefilteredRaw.map(c => c.vacancyId))]
    const vacancyTitles = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(inArray(vacancies.id, vacancyIds))
    const vacTitleMap = new Map(vacancyTitles.map(v => [v.id, v.title]))

    // Маппинг в RediscoveryCandidate
    const prefillCands: RediscoveryCandidate[] = prefilteredRaw.map(c => ({
      id:                   c.id,
      name:                 c.name,
      sourceVacancyId:      c.vacancyId,
      sourceVacancyTitle:   vacTitleMap.get(c.vacancyId) ?? "Неизвестная вакансия",
      skills:               c.skills ?? [],
      keySkills:            c.keySkills ?? [],
      experienceYears:      c.experienceYears,
      city:                 c.city,
      experience:           c.experience,
      aiScore:              c.aiScore,
      source:               c.source,
    }))

    // 3. Текстовый ранжинг — топ-50 по числу совпадений ключевых слов
    const keywords = buildKeywords(spec)
    const ranked = prefillCands
      .map(c => ({ c, ts: textScore(c, keywords) }))
      .sort((a, b) => b.ts - a.ts || (b.c.aiScore ?? -1) - (a.c.aiScore ?? -1))
      .slice(0, AI_TOP_LIMIT)
      .map(r => r.c)

    // 4. AI-оценка батчами (Haiku, 10 штук на вызов → макс. 5 вызовов)
    const specText = formatSpecForAI(spec)
    const allScores = new Map<string, { score: number; reason: string }>()

    for (let i = 0; i < ranked.length; i += AI_BATCH_SIZE) {
      const batch = ranked.slice(i, i + AI_BATCH_SIZE)
      const batchScores = await scoreBatch(batch, specText)
      for (const [k, v] of batchScores) allScores.set(k, v)
    }

    // 5. Сортируем по AI-score и строим результат
    const results: ScoredCandidate[] = ranked
      .map(c => {
        const scored = allScores.get(c.id)
        return {
          candidateId:        c.id,
          name:               c.name,
          sourceVacancyTitle: c.sourceVacancyTitle,
          sourceVacancyId:    c.sourceVacancyId,
          score:              scored?.score ?? 0,
          reason:             scored?.reason ?? "—",
        }
      })
      .sort((a, b) => b.score - a.score)

    const totalAiScored = allScores.size
    const lastRun: RediscoveryLastRun = {
      ranAt: new Date().toISOString(),
      totalPrefill,
      totalAiScored,
      results,
    }

    // 6. Сохраняем кеш в aiProcessSettings.rediscoveryLastRun
    await saveLastRun(targetVacancyId, targetVacancy.aiProcessSettings, lastRun)

    return apiSuccess({
      totalPrefill,
      totalAiScored,
      results,
      ranAt: lastRun.ranAt,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[rediscovery] error:", err)
    return apiError("Ошибка сервера", 500)
  }
}

// ─── GET: отдаём кешированный результат ──────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id: targetVacancyId } = await params

    const [row] = await db
      .select({ aiProcessSettings: vacancies.aiProcessSettings })
      .from(vacancies)
      .where(and(
        eq(vacancies.id, targetVacancyId),
        eq(vacancies.companyId, user.companyId),
      ))
      .limit(1)

    if (!row) return apiError("Вакансия не найдена", 404)

    const settings = row.aiProcessSettings as (VacancyAiProcessSettings & { rediscoveryLastRun?: RediscoveryLastRun }) | null
    const lastRun = settings?.rediscoveryLastRun ?? null

    return apiSuccess({ lastRun })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

// ─── Сохранение кеша ─────────────────────────────────────────────────────────

async function saveLastRun(
  vacancyId: string,
  existingSettings: unknown,
  lastRun: RediscoveryLastRun,
): Promise<void> {
  const current = (existingSettings && typeof existingSettings === "object")
    ? existingSettings as Record<string, unknown>
    : {}
  await db
    .update(vacancies)
    .set({
      aiProcessSettings: { ...current, rediscoveryLastRun: lastRun },
      updatedAt: new Date(),
    })
    .where(eq(vacancies.id, vacancyId))
}
