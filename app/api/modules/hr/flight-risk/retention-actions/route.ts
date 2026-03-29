import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { retentionActions } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

// GET /api/modules/hr/flight-risk/retention-actions
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const employeeId = url.searchParams.get("employeeId")

  const actions = await db
    .select()
    .from(retentionActions)
    .where(and(
      eq(retentionActions.tenantId, session.user.companyId),
      status ? eq(retentionActions.status, status) : undefined,
      employeeId ? eq(retentionActions.employeeId, employeeId) : undefined,
    ))
    .orderBy(desc(retentionActions.createdAt))

  return NextResponse.json(actions)
}

// POST /api/modules/hr/flight-risk/retention-actions — создать
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const [action] = await db
    .insert(retentionActions)
    .values({
      tenantId:    session.user.companyId,
      employeeId:  body.employeeId,
      title:       body.title,
      description: body.description,
      type:        body.type || "conversation",
      priority:    body.priority || "medium",
      assignedTo:  body.assignedTo || session.user.id,
      dueDate:     body.dueDate ? new Date(body.dueDate) : null,
    })
    .returning()

  return NextResponse.json(action, { status: 201 })
}
