import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { aiCourseProjects, courses, lessons } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params

  const [project] = await db.select().from(aiCourseProjects)
    .where(and(eq(aiCourseProjects.id, id), eq(aiCourseProjects.tenantId, user.companyId)))

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!project.result) return NextResponse.json({ error: "Курс не сгенерирован" }, { status: 400 })

  const result = project.result as { title: string; description: string; modules: { title: string; lessons: { title: string; content_markdown: string; duration_minutes: number; test?: { questions: unknown[] } }[] }[] }

  // Create course
  const allLessons = result.modules.flatMap((m) => m.lessons)
  const totalMin = allLessons.reduce((s, l) => s + (l.duration_minutes || 0), 0)

  const [course] = await db.insert(courses).values({
    tenantId: user.companyId,
    title: result.title || project.title,
    description: result.description || project.description || null,
    category: "custom",
    difficulty: "beginner",
    durationMin: totalMin,
    isPublished: false,
    createdBy: (user as { id?: string }).id || null,
  }).returning()

  // Create lessons
  let sortOrder = 0
  for (const mod of result.modules) {
    for (const lesson of mod.lessons) {
      await db.insert(lessons).values({
        courseId: course.id,
        title: lesson.title,
        type: lesson.test ? "quiz" : "content",
        content: {
          markdown: lesson.content_markdown,
          quiz: lesson.test?.questions,
        },
        durationMin: lesson.duration_minutes,
        sortOrder: sortOrder++,
      })
    }
  }

  // Update project
  await db.update(aiCourseProjects).set({
    publishedCourseId: course.id,
    status: "published",
    updatedAt: new Date(),
  }).where(eq(aiCourseProjects.id, id))

  return NextResponse.json({ courseId: course.id })
}
