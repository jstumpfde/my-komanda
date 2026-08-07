// Фаза 1 «бот прозревает»: компактный контекст кандидата для Executor'а
// AI-чат-бота. Раньше Sonnet получал только текущее сообщение + промпт вакансии
// и ничего не знал о человеке. Теперь даём краткую выжимку резюме + стадию.
//
// Выжимка НАМЕРЕННО компактная (≤ ~12 строк) — чтобы не раздувать токены и не
// тащить в контекст ПДн больше необходимого для осмысленного диалога.

import { eq, desc, and, gte, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhResponses, candidates, testSubmissions, calendarEvents } from "@/lib/db/schema"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { PLATFORM_STAGES, type StageSlug } from "@/lib/stages"
import { calcDemoPercent, type DemoProgressData } from "@/components/hr/demo-progress-bar"

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

// Прогресс кандидата по демо (шаг 1 «чат-бот до конца»): чтобы бот не звал
// проходить заново то, что уже пройдено, когда кандидат пишет «я уже проходил».
export interface CandidateProgress {
  demoPercent:     number | null  // 0..100, null = не приступал
  demoCompleted:   boolean        // demoProgressJson.completedAt задан
  demoLastActive:  Date | null    // demoProgressJson.lastUpdated
  anketaFilled:    boolean        // candidates.survey_responses IS NOT NULL
  testSubmitted:   boolean        // есть строка в test_submissions
  testInvited:     boolean        // candidates.test_invite_sent_at задан, тест ещё НЕ сдан
  interviewAt:     Date | null    // ближайшее НЕотменённое интервью в будущем
}

export interface CandidateContext {
  resumeSummary: string | null
  stageLabel:    string | null
  progress:      CandidateProgress | null
}

// Загружает прогресс кандидата по воронке (демо/анкета/тест/интервью) —
// один доп. запрос к candidates + два лёгких индексированных запроса к
// test_submissions/calendar_events, выполняются параллельно. Любая ошибка/
// отсутствие данных → null (блок в промпте просто не появится).
async function loadCandidateProgress(candidateId: string): Promise<CandidateProgress | null> {
  try {
    const now = new Date()
    const [[cand], [test], [interview]] = await Promise.all([
      db
        .select({
          demoProgressJson: candidates.demoProgressJson,
          surveyResponses:  candidates.surveyResponses,
          testInviteSentAt: candidates.testInviteSentAt,
        })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .limit(1),
      db
        .select({ id: testSubmissions.id })
        .from(testSubmissions)
        .where(eq(testSubmissions.candidateId, candidateId))
        .limit(1),
      db
        .select({ startAt: calendarEvents.startAt })
        .from(calendarEvents)
        .where(and(
          eq(calendarEvents.candidateId, candidateId),
          eq(calendarEvents.type, "interview"),
          ne(calendarEvents.status, "cancelled"),
          gte(calendarEvents.startAt, now),
        ))
        .orderBy(calendarEvents.startAt)
        .limit(1),
    ])

    if (!cand) return null

    const dp = (cand.demoProgressJson ?? null) as DemoProgressData | null
    const { percent } = calcDemoPercent(dp)
    const demoLastUpdated = (dp as { lastUpdated?: string } | null)?.lastUpdated ?? null

    return {
      demoPercent:    percent,
      demoCompleted:  Boolean((dp as { completedAt?: string | null } | null)?.completedAt),
      demoLastActive: demoLastUpdated ? new Date(demoLastUpdated) : null,
      anketaFilled:   cand.surveyResponses != null,
      testSubmitted:  Boolean(test),
      testInvited:    Boolean(cand.testInviteSentAt) && !test,
      interviewAt:    interview?.startAt ? new Date(interview.startAt) : null,
    }
  } catch (err) {
    console.warn("[candidate-context] progress load failed:", err instanceof Error ? err.message : err)
    return null
  }
}
// Загружает контекст кандидата для Executor'а: выжимку резюме (последний hh-отклик)
// + читаемый ярлык текущей стадии + прогресс по воронке. Тихо отдаёт null'ы,
// если данных нет.
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

  const progress = await loadCandidateProgress(candidateId)

  return { resumeSummary, stageLabel, progress }
}

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// Компактная выжимка прогресса кандидата по воронке (демо/анкета/тест/интервью).
// Строки для НЕпройденных/отсутствующих шагов опускаются — только факты, которые
// точно известны. null → пустая строка (нет данных или ошибка загрузки).
function formatProgressLines(p: CandidateProgress | null): string[] {
  if (!p) return []
  const lines: string[] = []

  if (p.demoCompleted) {
    lines.push("Демо-презентация: ПРОЙДЕНА ПОЛНОСТЬЮ — не предлагать пройти заново.")
  } else if (p.demoPercent !== null && p.demoPercent > 0) {
    lines.push(`Демо-презентация: начата, пройдено ~${p.demoPercent}%` + (p.demoLastActive ? ` (последняя активность ${fmtDateTime(p.demoLastActive)})` : "") + ".")
  }

  if (p.anketaFilled) lines.push("Анкета: уже заполнена — не просить заполнить повторно.")

  if (p.testSubmitted) lines.push("Тестовое задание: уже отправлено кандидатом (сдано) — не просить пройти снова.")
  else if (p.testInvited) lines.push("Тестовое задание: отправлено кандидату, ответа пока нет.")

  if (p.interviewAt) lines.push(`Интервью: назначено на ${fmtDateTime(p.interviewAt)} — уже согласовано, повторно не предлагать.`)

  return lines
}

// Собирает текстовый блок «о собеседнике» для вставки в system-prompt Executor'а.
// Пусто, если нет ни выжимки, ни стадии, ни прогресса.
export function formatCandidateContextBlock(ctx: CandidateContext, candidateName: string | null): string {
  const parts: string[] = []
  if (candidateName && candidateName.trim() && candidateName !== "Кандидат") {
    parts.push(`Имя кандидата: ${candidateName.trim()}`)
  }
  if (ctx.stageLabel) parts.push(`Этап в воронке: ${ctx.stageLabel}`)

  const progressLines = formatProgressLines(ctx.progress)
  if (progressLines.length) {
    parts.push(
      "Прогресс кандидата по воронке (важно — не зови проходить уже пройденное):\n" +
      progressLines.map((l) => `- ${l}`).join("\n") +
      "\nЕсли кандидат пишет «я уже проходил/сдавал» — согласись, не спорь, и мягко подскажи следующий шаг воронки, а не повтори пройденный. " +
      "Внутренние оценки/баллы (резюме, демо, тест) кандидату НЕ раскрывай ни при каких обстоятельствах."
    )
  }

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
