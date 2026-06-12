// Фаза 1 «бот прозревает»: компактный контекст кандидата для Executor'а
// AI-чат-бота. Раньше Sonnet получал только текущее сообщение + промпт вакансии
// и ничего не знал о человеке. Теперь даём краткую выжимку резюме + стадию.
//
// Выжимка НАМЕРЕННО компактная (≤ ~12 строк) — чтобы не раздувать токены и не
// тащить в контекст ПДн больше необходимого для осмысленного диалога.

import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhResponses } from "@/lib/db/schema"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { PLATFORM_STAGES, type StageSlug } from "@/lib/stages"

const EDU_LABEL: Record<string, string> = {
  secondary: "среднее", specialized: "среднее спец.", higher: "высшее", mba: "MBA",
}
const FORMAT_LABEL: Record<string, string> = {
  office: "офис", hybrid: "гибрид", remote: "удалёнка",
}

// Последние 1-2 места работы из resume.experience[] (должность @ компания).
function recentPositions(resume: Record<string, unknown> | null): string[] {
  const exp = resume?.["experience"]
  if (!Array.isArray(exp)) return []
  return exp.slice(0, 2).map((e) => {
    const pos = typeof (e as { position?: unknown })?.position === "string" ? (e as { position: string }).position : ""
    const comp = typeof (e as { company?: unknown })?.company === "string" ? (e as { company: string }).company : ""
    return [pos, comp].filter(Boolean).join(" @ ")
  }).filter(Boolean)
}

// Краткая текстовая выжимка резюме на русском. null — если данных нет.
export function buildResumeSummaryText(rawData: unknown): string | null {
  const resume = (rawData as { resume?: Record<string, unknown> } | null)?.resume ?? null
  if (!resume) return null
  const f = extractHhResumeFields(resume)

  const lines: string[] = []
  const roles = Array.isArray(f.professionalRoles) ? f.professionalRoles.filter(Boolean) : []
  if (roles.length) lines.push(`Желаемая роль: ${roles.slice(0, 3).join(", ")}`)

  const age = typeof resume["age"] === "number" ? resume["age"] : null
  const ageCity = [age ? `${age} лет` : null, f.city || null].filter(Boolean).join(", ")
  if (ageCity) lines.push(`Возраст/город: ${ageCity}`)

  if (typeof f.experienceYears === "number") lines.push(`Опыт: ~${f.experienceYears} лет`)

  const positions = recentPositions(resume)
  if (positions.length) lines.push(`Последние места: ${positions.join("; ")}`)

  const skills = [...(f.keySkills ?? []), ...(f.skills ?? [])].filter(Boolean)
  if (skills.length) lines.push(`Навыки: ${[...new Set(skills)].slice(0, 8).join(", ")}`)

  if (f.salaryMin || f.salaryMax) {
    const cur = f.salaryCurrency && f.salaryCurrency !== "RUR" ? ` ${f.salaryCurrency}` : " ₽"
    const val = f.salaryMin && f.salaryMax && f.salaryMin !== f.salaryMax
      ? `${f.salaryMin}–${f.salaryMax}` : `${f.salaryMin ?? f.salaryMax}`
    lines.push(`Зарплатные ожидания: ${val}${cur}`)
  }

  if (f.educationLevel && EDU_LABEL[f.educationLevel]) lines.push(`Образование: ${EDU_LABEL[f.educationLevel]}`)
  if (Array.isArray(f.languages) && f.languages.length) lines.push(`Языки: ${f.languages.slice(0, 4).join(", ")}`)
  if (Array.isArray(f.citizenshipNames) && f.citizenshipNames.length) lines.push(`Гражданство: ${f.citizenshipNames.slice(0, 2).join(", ")}`)
  if (f.workFormat && FORMAT_LABEL[f.workFormat]) lines.push(`Формат: ${FORMAT_LABEL[f.workFormat]}`)

  return lines.length ? lines.join("\n") : null
}

export interface CandidateContext {
  resumeSummary: string | null
  stageLabel:    string | null
}

// Загружает контекст кандидата для Executor'а: выжимку резюме (последний hh-отклик)
// + читаемый ярлык текущей стадии. Тихо отдаёт null'ы, если данных нет.
export async function loadCandidateContext(
  candidateId: string, stageSlug: string | null,
): Promise<CandidateContext> {
  let resumeSummary: string | null = null
  try {
    const [row] = await db
      .select({ raw: hhResponses.rawData })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, candidateId))
      .orderBy(desc(hhResponses.createdAt))
      .limit(1)
    if (row?.raw) resumeSummary = buildResumeSummaryText(row.raw)
  } catch (err) {
    console.warn("[candidate-context] resume load failed:", err instanceof Error ? err.message : err)
  }

  const stageLabel = stageSlug && PLATFORM_STAGES[stageSlug as StageSlug]
    ? PLATFORM_STAGES[stageSlug as StageSlug].defaultLabel
    : null

  return { resumeSummary, stageLabel }
}

// Собирает текстовый блок «о собеседнике» для вставки в system-prompt Executor'а.
// Пусто, если нет ни выжимки, ни стадии.
export function formatCandidateContextBlock(ctx: CandidateContext, candidateName: string | null): string {
  const parts: string[] = []
  if (candidateName && candidateName.trim() && candidateName !== "Кандидат") {
    parts.push(`Имя кандидата: ${candidateName.trim()}`)
  }
  if (ctx.stageLabel) parts.push(`Этап в воронке: ${ctx.stageLabel}`)
  if (ctx.resumeSummary) parts.push(`Краткое резюме:\n${ctx.resumeSummary}`)
  if (parts.length === 0) return ""
  return [
    "",
    "─── О СОБЕСЕДНИКЕ (для тебя, не пересказывай дословно) ───",
    parts.join("\n"),
    "Используй это, чтобы отвечать предметно и по делу. НЕ зачитывай резюме кандидату и не выдумывай фактов сверх указанного.",
    "──────────────────────────────────────────────",
    "",
  ].join("\n")
}
