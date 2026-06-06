/**
 * backfill-test-scoring.ts
 *
 * Одноразовый пересчёт объективного скоринга теста по НОВОЙ формуле
 * (per-option баллы + частичный зачёт для multiple, см. lib/score-test-objective).
 *
 * Для каждой ОТПРАВЛЕННОЙ заявки (test_submissions.submitted_at IS NOT NULL) со
 * структурированными ответами (answers_json.answers[]):
 *   1. Берёт текущие вопросы теста вакансии (demo kind='test') — т.е. применяет
 *      актуальные правила скоринга, заданные HR в редакторе.
 *   2. Пересчитывает objective = scoreObjective(...) и кладёт в answers_json.objective
 *      (это чинит per-question бейджи и строку «(got/max)» в таблицах сравнения).
 *   3. Пересчитывает итоговый ai_score:
 *        • объективный + текст (бленд) → восстанавливает AI-подскор из старого
 *          ai_score и старого objective.score, затем пере-усредняет с новым objective;
 *        • только объективный → ai_score = новый objective.score;
 *        • только текст (нет объективного) → ai_score не трогаем.
 *      Обоснование (ai_reasoning) обновляет ведущую строку «Автопроверка: …».
 *
 * НЕ трогает candidates.stage и НЕ шлёт сообщений — ретроспективно «прошёл/не
 * прошёл» не меняем, рассылки не триггерим. Идемпотентен: повторный прогон даёт
 * тот же результат.
 *
 * Запуск (превью без записи):
 *   DRY_RUN=1 npx tsx --env-file=.env.local scripts/backfill-test-scoring.ts
 * Запуск (запись):
 *   npx tsx --env-file=.env.local scripts/backfill-test-scoring.ts
 *
 * Параметры через ENV:
 *   DRY_RUN=1    — только показать, что изменилось бы, без UPDATE
 *   VACANCY_ID=… — обработать только одну вакансию (по умолчанию все)
 *   LIMIT=0      — обработать только первые N заявок (0 = все)
 */

import { eq, and, desc, isNotNull } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { testSubmissions, candidates, demos } from "@/lib/db/schema"
import { scoreObjective, collectTaskQuestions } from "@/lib/score-test-objective"
import type { Question } from "@/lib/course-types"

interface StoredAnswer { questionId?: string; answerType?: string; value?: unknown }
interface StoredObjective { score?: number; gotPoints?: number; maxPoints?: number }
interface StoredAnswersJson { answers?: StoredAnswer[]; objective?: StoredObjective }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

async function main() {
  const start = Date.now()
  const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  const ONLY_VACANCY = (process.env.VACANCY_ID || "").trim() || null
  const LIMIT = Math.max(0, Number(process.env.LIMIT) || 0)

  console.log(`[${new Date().toISOString()}] backfill-test-scoring: старт${DRY ? " (DRY_RUN — без записи)" : ""}${ONLY_VACANCY ? ` vacancy=${ONLY_VACANCY}` : ""}`)

  // Кэш вопросов теста по demoId и по vacancyId (берём актуальную версию).
  const questionsByDemo = new Map<string, Question[]>()
  const questionsByVacancy = new Map<string, Question[]>()

  async function questionsForDemo(demoId: string | null): Promise<Question[] | null> {
    if (!demoId) return null
    if (questionsByDemo.has(demoId)) return questionsByDemo.get(demoId)!
    const [d] = await db.select({ lessonsJson: demos.lessonsJson }).from(demos).where(eq(demos.id, demoId)).limit(1)
    const lessons = Array.isArray(d?.lessonsJson) ? (d!.lessonsJson as any[]) : []
    const qs = collectTaskQuestions(lessons)
    questionsByDemo.set(demoId, qs)
    return qs
  }
  async function questionsForVacancy(vacancyId: string): Promise<Question[]> {
    if (questionsByVacancy.has(vacancyId)) return questionsByVacancy.get(vacancyId)!
    const [d] = await db.select({ lessonsJson: demos.lessonsJson })
      .from(demos).where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt)).limit(1)
    const lessons = Array.isArray(d?.lessonsJson) ? (d!.lessonsJson as any[]) : []
    const qs = collectTaskQuestions(lessons)
    questionsByVacancy.set(vacancyId, qs)
    return qs
  }

  let processed = 0, updated = 0, skipped = 0, failed = 0
  const examples: string[] = []

  try {
    const rows = await db
      .select({
        id: testSubmissions.id,
        demoId: testSubmissions.demoId,
        answersJson: testSubmissions.answersJson,
        aiScore: testSubmissions.aiScore,
        aiReasoning: testSubmissions.aiReasoning,
        candidateId: testSubmissions.candidateId,
        vacancyId: candidates.vacancyId,
      })
      .from(testSubmissions)
      .innerJoin(candidates, eq(candidates.id, testSubmissions.candidateId))
      .where(isNotNull(testSubmissions.submittedAt))
      .orderBy(desc(testSubmissions.submittedAt))

    for (const r of rows) {
      if (LIMIT && processed >= LIMIT) break
      if (ONLY_VACANCY && r.vacancyId !== ONLY_VACANCY) continue
      processed++

      const aj = (r.answersJson && typeof r.answersJson === "object" ? r.answersJson : null) as StoredAnswersJson | null
      const answers = Array.isArray(aj?.answers) ? aj!.answers! : []
      if (answers.length === 0) { skipped++; continue } // legacy/текстовая заявка — нечего пересчитывать

      const questions = (await questionsForDemo(r.demoId)) ?? (await questionsForVacancy(r.vacancyId))
      if (!questions || questions.length === 0) { skipped++; continue }

      const answersByQ: Record<string, string> = {}
      for (const a of answers) {
        if (typeof a.questionId === "string") answersByQ[a.questionId] = typeof a.value === "string" ? a.value : String(a.value ?? "")
      }

      const objNew = scoreObjective(questions, answersByQ)
      const hasObjNew = objNew.maxPoints > 0

      const oldObj = aj?.objective ?? null
      const hasObjOld = typeof oldObj?.maxPoints === "number" && oldObj.maxPoints > 0
      const oldObjScore = typeof oldObj?.score === "number" ? oldObj.score : null
      const oldAi = typeof r.aiScore === "number" ? r.aiScore : null

      // ── Новый итоговый балл ──
      let newAi: number | null = oldAi
      if (hasObjNew && hasObjOld && oldAi != null && oldObjScore != null) {
        // Восстанавливаем AI-подскор из старого бленда: ai_old = round((obj_old + AI)/2).
        const aiSub = 2 * oldAi - oldObjScore
        newAi = aiSub >= 0 && aiSub <= 100
          ? Math.round((objNew.score + clamp(aiSub, 0, 100)) / 2) // был бленд → пере-усредняем
          : objNew.score                                          // AI, видимо, не отработал → только объективный
      } else if (hasObjNew) {
        newAi = objNew.score
      } // else: нет объективного в новой версии → ai_score оставляем как есть

      // ── Обоснование: обновляем ведущую строку «Автопроверка: …» ──
      let newReasoning = r.aiReasoning ?? null
      if (hasObjNew) {
        const tail = (r.aiReasoning || "").replace(/^Автопроверка:[^.]*\.\s*/, "").trim()
        newReasoning = `Автопроверка: ${objNew.gotPoints} из ${objNew.maxPoints} баллов (${objNew.score}%).${tail ? " " + tail : ""}`
      }

      const newAnswersJson = { ...(aj || {}), answers, objective: objNew }

      const changed = JSON.stringify(oldObj) !== JSON.stringify(objNew) || newAi !== oldAi
      if (!changed) { skipped++; continue }

      if (examples.length < 12) {
        examples.push(`  ${r.id.slice(0, 8)}: obj ${oldObjScore ?? "—"}%→${objNew.score}% (${objNew.gotPoints}/${objNew.maxPoints}), ai ${oldAi ?? "—"}→${newAi ?? "—"}`)
      }

      if (!DRY) {
        await db.update(testSubmissions)
          .set({ answersJson: newAnswersJson, aiScore: newAi, aiReasoning: newReasoning })
          .where(eq(testSubmissions.id, r.id))
      }
      updated++
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000)
    console.log(`[${new Date().toISOString()}] готово${DRY ? " (DRY_RUN)" : ""}.`)
    console.log(`  ~ просмотрено: ${processed}`)
    console.log(`  ✓ ${DRY ? "изменилось бы" : "обновлено"}: ${updated}`)
    console.log(`  - пропущено:   ${skipped}`)
    console.log(`  ✗ ошибок:      ${failed}`)
    if (examples.length) { console.log("  примеры:"); examples.forEach((e) => console.log(e)) }
    console.log(`  время:         ${elapsedSec}с`)

    await pgClient.end({ timeout: 5 })
    process.exit(0)
  } catch (err) {
    console.error("Фатальная ошибка:", err)
    try { await pgClient.end({ timeout: 5 }) } catch { /* ignore */ }
    process.exit(1)
  }
}

main()
