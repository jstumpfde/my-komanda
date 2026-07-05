import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { lessons, courseEnrollments, lessonCompletions, certificates, courses } from "@/lib/db/schema"
import { eq, and, count } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireAcademyAccess } from "@/lib/academy/access"

// Квиз-вопрос — поддерживаем обе формы, реально встречающиеся в данных
// (см. разведку): ручной редактор пишет {q, options, answer}, AI-публикация
// пишет {question, options, correct_index}. НЕ уникальный формат — берём то,
// что заполнено.
interface QuizQuestion {
  q?: string
  question?: string
  options: string[]
  answer?: number
  correct_index?: number
}

function correctIndexOf(q: QuizQuestion): number {
  return typeof q.answer === "number" ? q.answer : (typeof q.correct_index === "number" ? q.correct_index : -1)
}

// Объективный скоринг квиз-урока СЕРВЕРОМ (не доверяем score от клиента —
// иначе тест можно "сдать" подделав тело запроса). answers — индекс выбранного
// варианта per вопрос (по порядку вопросов в content.questions/content.quiz).
function gradeQuiz(content: unknown, answers: number[] | undefined): number | null {
  if (!content || typeof content !== "object") return null
  const c = content as { questions?: QuizQuestion[]; quiz?: QuizQuestion[] }
  const questions = c.questions ?? c.quiz
  if (!Array.isArray(questions) || questions.length === 0) return null
  if (!Array.isArray(answers)) return 0

  let correct = 0
  questions.forEach((q, i) => {
    const want = correctIndexOf(q)
    if (want >= 0 && answers[i] === want) correct += 1
  })
  return Math.round((correct / questions.length) * 100)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAcademyAccess()
    const { id: courseId } = await params
    const body = await req.json()
    const { enrollmentId, lessonId, answers, timeSpentSec } = body

    if (!enrollmentId || !lessonId) return apiError("enrollmentId и lessonId обязательны", 400)

    const [enrollment] = await db.select()
      .from(courseEnrollments)
      .where(eq(courseEnrollments.id, enrollmentId))

    if (!enrollment) return apiError("Запись не найдена", 404)

    const [lesson] = await db.select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))

    if (!lesson) return apiError("Урок не найден", 404)

    // Квиз-урок — считаем балл сервером по эталону из content; для остальных
    // типов уроков score = null (нечего оценивать, засчитывается по факту).
    const score = lesson.type === "quiz" ? gradeQuiz(lesson.content, answers) : null

    const existing = await db.select({ id: lessonCompletions.id })
      .from(lessonCompletions)
      .where(and(eq(lessonCompletions.enrollmentId, enrollmentId), eq(lessonCompletions.lessonId, lessonId)))

    let completion
    if (existing.length > 0) {
      ;[completion] = await db.update(lessonCompletions).set({
        status: "completed",
        score,
        answer: Array.isArray(answers) ? answers : null,
        completedAt: new Date(),
        timeSpentSec: timeSpentSec || null,
      }).where(eq(lessonCompletions.id, existing[0].id)).returning()
    } else {
      ;[completion] = await db.insert(lessonCompletions).values({
        enrollmentId,
        lessonId,
        status: "completed",
        score,
        answer: Array.isArray(answers) ? answers : null,
        completedAt: new Date(),
        timeSpentSec: timeSpentSec || null,
      }).returning()
    }

    // Пересчёт % прохождения курса.
    const [totalRes] = await db.select({ val: count() }).from(lessons).where(eq(lessons.courseId, courseId))
    const [doneRes] = await db.select({ val: count() }).from(lessonCompletions)
      .where(and(eq(lessonCompletions.enrollmentId, enrollmentId), eq(lessonCompletions.status, "completed")))

    const total = totalRes?.val ?? 0
    const done = doneRes?.val ?? 0
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const allLessonsDone = pct === 100

    // Средний % по всем пройденным quiz-урокам курса (для гейта по порогу сдачи).
    const quizCompletions = await db.select({ score: lessonCompletions.score, type: lessons.type })
      .from(lessonCompletions)
      .innerJoin(lessons, eq(lessons.id, lessonCompletions.lessonId))
      .where(and(eq(lessonCompletions.enrollmentId, enrollmentId), eq(lessons.type, "quiz"), eq(lessonCompletions.status, "completed")))

    const quizScores = quizCompletions.map((r) => r.score).filter((s): s is number => typeof s === "number")
    const quizScorePercent = quizScores.length > 0
      ? Math.round(quizScores.reduce((s, v) => s + v, 0) / quizScores.length)
      : null

    const [course] = await db.select({ passingScorePercent: courses.passingScorePercent })
      .from(courses)
      .where(eq(courses.id, courseId))

    const threshold = course?.passingScorePercent
    // Порог задан И есть хоть один quiz-урок И средний балл ниже порога → курс
    // не засчитан, даже если все уроки формально пройдены (нужно пересдать квиз).
    const passesThreshold = threshold == null || quizScorePercent == null || quizScorePercent >= threshold
    const isCompleted = allLessonsDone && passesThreshold
    const isFailed = allLessonsDone && !passesThreshold

    await db.update(courseEnrollments).set({
      completionPct: pct,
      quizScorePercent,
      status: isCompleted ? "completed" : isFailed ? "failed" : (enrollment.startedAt ? "in_progress" : "enrolled"),
      startedAt: enrollment.startedAt || new Date(),
      completedAt: isCompleted ? new Date() : null,
      lastAccessAt: new Date(),
    }).where(eq(courseEnrollments.id, enrollmentId))

    // Сертификат — только при реальной сдаче (все уроки + порог, если задан).
    let certificate = null
    if (isCompleted) {
      const existingCert = await db.select().from(certificates)
        .where(and(eq(certificates.courseId, courseId), eq(certificates.employeeId, enrollment.employeeId)))

      if (existingCert.length === 0) {
        const num = `MK-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
        ;[certificate] = await db.insert(certificates).values({
          courseId,
          employeeId: enrollment.employeeId,
          number: num,
        }).returning()
      } else {
        certificate = existingCert[0]
      }
    }

    return apiSuccess({ completion, completionPct: pct, quizScorePercent, passingScorePercent: threshold, isCompleted, isFailed, certificate })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[academy/courses/[id]/complete-lesson POST]", err)
    return apiError("Internal server error", 500)
  }
}
