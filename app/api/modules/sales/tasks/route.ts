import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesTasks, salesDeals } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — список задач тенанта (с названием связанной сделки)
export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select({
        id: salesTasks.id,
        title: salesTasks.title,
        description: salesTasks.description,
        priority: salesTasks.priority,
        dueDate: salesTasks.dueDate,
        done: salesTasks.done,
        dealId: salesTasks.dealId,
        assigneeName: salesTasks.assigneeName,
        createdAt: salesTasks.createdAt,
        dealTitle: salesDeals.title,
      })
      .from(salesTasks)
      .leftJoin(salesDeals, eq(salesTasks.dealId, salesDeals.id))
      .where(eq(salesTasks.tenantId, user.companyId))
      .orderBy(desc(salesTasks.createdAt))
    return apiSuccess({ tasks: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST — создать задачу
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.title?.trim()) return apiError("'title' is required", 400)
    const [task] = await db
      .insert(salesTasks)
      .values({
        tenantId: user.companyId,
        title: body.title.trim(),
        description: body.description || null,
        priority: ["high", "medium", "low"].includes(body.priority) ? body.priority : "medium",
        dueDate: body.dueDate || null,
        dealId: body.dealId || null,
        assigneeName: body.assigneeName || null,
      })
      .returning()
    return apiSuccess(task, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// PATCH — обновить задачу (done / поля) по id в теле
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.id) return apiError("'id' is required", 400)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.done !== undefined) set.done = body.done
    if (body.title !== undefined) set.title = body.title
    if (body.description !== undefined) set.description = body.description
    if (body.priority !== undefined) set.priority = body.priority
    if (body.dueDate !== undefined) set.dueDate = body.dueDate || null
    if (body.dealId !== undefined) set.dealId = body.dealId || null
    if (body.assigneeName !== undefined) set.assigneeName = body.assigneeName || null

    const [updated] = await db
      .update(salesTasks)
      .set(set)
      .where(and(eq(salesTasks.id, body.id), eq(salesTasks.tenantId, user.companyId)))
      .returning()
    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// DELETE — удалить задачу по id в теле
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.id) return apiError("'id' is required", 400)
    const [deleted] = await db
      .delete(salesTasks)
      .where(and(eq(salesTasks.id, body.id), eq(salesTasks.tenantId, user.companyId)))
      .returning()
    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
