import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { taskComments, taskActivityLog } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try { await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const comments = await db.select().from(taskComments).where(eq(taskComments.taskId, id)).orderBy(desc(taskComments.createdAt))
  return NextResponse.json(comments)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  let user
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await ctx.params
  const body = await req.json()

  if (!body.content?.trim()) return NextResponse.json({ error: "Комментарий обязателен" }, { status: 400 })

  const [comment] = await db.insert(taskComments).values({
    taskId: id,
    userId: (user as { id?: string }).id || null,
    content: body.content.trim(),
  }).returning()

  await db.insert(taskActivityLog).values({
    taskId: id,
    userId: (user as { id?: string }).id || null,
    action: "commented",
    newValue: body.content.trim().slice(0, 100),
  })

  return NextResponse.json(comment, { status: 201 })
}
