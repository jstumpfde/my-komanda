import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesDeals, salesCompanies, salesContacts, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { runStageAutomations } from "@/lib/sales/automations"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deal] = await db
      .select({
        id: salesDeals.id,
        title: salesDeals.title,
        amount: salesDeals.amount,
        currency: salesDeals.currency,
        stage: salesDeals.stage,
        priority: salesDeals.priority,
        probability: salesDeals.probability,
        companyId: salesDeals.companyId,
        contactId: salesDeals.contactId,
        assignedToId: salesDeals.assignedToId,
        description: salesDeals.description,
        source: salesDeals.source,
        expectedCloseDate: salesDeals.expectedCloseDate,
        closedAt: salesDeals.closedAt,
        createdAt: salesDeals.createdAt,
        updatedAt: salesDeals.updatedAt,
        companyName: salesCompanies.name,
        contactFirstName: salesContacts.firstName,
        contactLastName: salesContacts.lastName,
        contactEmail: salesContacts.email,
        contactPhone: salesContacts.phone,
        assignedToName: users.name,
        assignedToAvatar: users.avatarUrl,
      })
      .from(salesDeals)
      .leftJoin(salesCompanies, eq(salesDeals.companyId, salesCompanies.id))
      .leftJoin(salesContacts, eq(salesDeals.contactId, salesContacts.id))
      .leftJoin(users, eq(salesDeals.assignedToId, users.id))
      .where(and(eq(salesDeals.id, id), eq(salesDeals.tenantId, user.companyId)))

    if (!deal) return apiError("Not found", 404)
    return apiSuccess(deal)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    // Текущая стадия — чтобы запустить автоматизации только при реальной смене.
    let prevStage: string | null = null
    if (body.stage !== undefined) {
      const [cur] = await db
        .select({ stage: salesDeals.stage })
        .from(salesDeals)
        .where(and(eq(salesDeals.id, id), eq(salesDeals.tenantId, user.companyId)))
        .limit(1)
      prevStage = cur?.stage ?? null
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.title !== undefined) updateData.title = body.title
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.stage !== undefined) {
      updateData.stage = body.stage
      if (body.stage === "won" || body.stage === "lost") {
        updateData.closedAt = new Date()
      }
    }
    // Явный closedAt (терминальные стадии воронки записи: showed/no_show и т.п.).
    if (body.closedAt !== undefined) {
      updateData.closedAt = body.closedAt ? new Date(body.closedAt) : null
    }
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.probability !== undefined) updateData.probability = body.probability
    if (body.companyId !== undefined) updateData.companyId = body.companyId || null
    if (body.contactId !== undefined) updateData.contactId = body.contactId || null
    if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null
    if (body.description !== undefined) updateData.description = body.description
    if (body.source !== undefined) updateData.source = body.source
    if (body.expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = body.expectedCloseDate ? new Date(body.expectedCloseDate) : null
    }

    const [updated] = await db
      .update(salesDeals)
      .set(updateData)
      .where(and(eq(salesDeals.id, id), eq(salesDeals.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)

    // Автоматизации воронки — при реальной смене стадии.
    if (body.stage !== undefined && body.stage !== prevStage) {
      await runStageAutomations(user.companyId, id, body.stage)
    }

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .delete(salesDeals)
      .where(and(eq(salesDeals.id, id), eq(salesDeals.tenantId, user.companyId)))
      .returning()

    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
