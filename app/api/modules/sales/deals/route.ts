import { NextRequest } from "next/server"
import { eq, and, ilike, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesDeals, salesCompanies, salesContacts, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { DEAL_STAGES } from "@/lib/crm/deal-stages"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const sp = req.nextUrl.searchParams

    const stageFilter = sp.get("stage")
    const assignedFilter = sp.get("assignedToId")
    const companyFilter = sp.get("companyId")
    const priorityFilter = sp.get("priority")
    const search = sp.get("search")

    const conditions = [eq(salesDeals.tenantId, user.companyId)]

    if (stageFilter && stageFilter !== "all") {
      conditions.push(eq(salesDeals.stage, stageFilter))
    }
    if (assignedFilter && assignedFilter !== "all") {
      conditions.push(eq(salesDeals.assignedToId, assignedFilter))
    }
    if (companyFilter) {
      conditions.push(eq(salesDeals.companyId, companyFilter))
    }
    if (priorityFilter && priorityFilter !== "all") {
      conditions.push(eq(salesDeals.priority, priorityFilter))
    }
    if (search) {
      conditions.push(
        or(
          ilike(salesDeals.title, `%${search}%`),
          ilike(salesDeals.description, `%${search}%`),
        )!,
      )
    }

    const where = and(...conditions)

    const rows = await db
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
        assignedToName: users.name,
        assignedToAvatar: users.avatarUrl,
      })
      .from(salesDeals)
      .leftJoin(salesCompanies, eq(salesDeals.companyId, salesCompanies.id))
      .leftJoin(salesContacts, eq(salesDeals.contactId, salesContacts.id))
      .leftJoin(users, eq(salesDeals.assignedToId, users.id))
      .where(where)
      .orderBy(salesDeals.createdAt)

    // Группируем по stage для канбана
    const grouped: Record<string, typeof rows> = {}
    for (const stage of DEAL_STAGES) {
      grouped[stage.id] = []
    }
    for (const row of rows) {
      const stageId = row.stage ?? "new"
      if (!grouped[stageId]) grouped[stageId] = []
      grouped[stageId].push(row)
    }

    return apiSuccess({ deals: rows, grouped, total: rows.length })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.title?.trim()) {
      return apiError("'title' is required", 400)
    }

    const [deal] = await db
      .insert(salesDeals)
      .values({
        tenantId: user.companyId,
        title: body.title.trim(),
        amount: body.amount ?? null,
        currency: body.currency || "RUB",
        stage: body.stage || "new",
        priority: body.priority || "medium",
        probability: body.probability ?? DEAL_STAGES.find((s) => s.id === (body.stage || "new"))?.probability ?? 0,
        companyId: body.companyId || null,
        contactId: body.contactId || null,
        assignedToId: body.assignedToId || null,
        description: body.description || null,
        source: body.source || null,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
      })
      .returning()

    return apiSuccess(deal, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
