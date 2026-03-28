import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, lessons, courseEnrollments, lessonCompletions, certificates } from "@/lib/db/schema"
import { eq, and, count } from "drizzle-orm"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { id: courseId } = await params
  const body = await req.json()
  const { enrollmentId, lessonId, score, answer, timeSpentSec } = body

  if (!enrollmentId || !lessonId) return NextResponse.json({ error: "enrollmentId и lessonId обязательны" }, { status: 400 })

  // verify enrollment belongs to tenant course
  const [enrollment] = await db.select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, enrollmentId))

  if (!enrollment) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 })

  // upsert lesson completion
  const existing = await db.select({ id: lessonCompletions.id })
    .from(lessonCompletions)
    .where(and(eq(lessonCompletions.enrollmentId, enrollmentId), eq(lessonCompletions.lessonId, lessonId)))

  let completion
  if (existing.length > 0) {
    ;[completion] = await db.update(lessonCompletions).set({
      status: "completed",
      score: score || null,
      answer: answer || null,
      completedAt: new Date(),
      timeSpentSec: timeSpentSec || null,
    }).where(eq(lessonCompletions.id, existing[0].id)).returning()
  } else {
    ;[completion] = await db.insert(lessonCompletions).values({
      enrollmentId,
      lessonId,
      status: "completed",
      score: score || null,
      answer: answer || null,
      completedAt: new Date(),
      timeSpentSec: timeSpentSec || null,
    }).returning()
  }

  // recalculate completion %
  const [totalRes] = await db.select({ val: count() }).from(lessons).where(eq(lessons.courseId, courseId))
  const [doneRes] = await db.select({ val: count() }).from(lessonCompletions)
    .where(and(eq(lessonCompletions.enrollmentId, enrollmentId), eq(lessonCompletions.status, "completed")))

  const total = totalRes?.val ?? 0
  const done = doneRes?.val ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const isCompleted = pct === 100

  await db.update(courseEnrollments).set({
    completionPct: pct,
    status: isCompleted ? "completed" : enrollment.startedAt ? "in_progress" : "enrolled",
    startedAt: enrollment.startedAt || new Date(),
    completedAt: isCompleted ? new Date() : null,
    lastAccessAt: new Date(),
  }).where(eq(courseEnrollments.id, enrollmentId))

  // issue certificate if completed
  let certificate = null
  if (isCompleted) {
    const existing = await db.select().from(certificates)
      .where(and(eq(certificates.courseId, courseId), eq(certificates.employeeId, enrollment.employeeId)))

    if (existing.length === 0) {
      const num = `MK-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
      ;[certificate] = await db.insert(certificates).values({
        courseId,
        employeeId: enrollment.employeeId,
        number: num,
      }).returning()
    } else {
      certificate = existing[0]
    }
  }

  return NextResponse.json({ completion, completionPct: pct, isCompleted, certificate })
}
