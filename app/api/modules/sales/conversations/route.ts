import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesConversations } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — список диалогов тенанта (для привязки к сделке и отображения).
// ?dealId=<id> — только диалоги, привязанные к конкретной сделке.
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const dealId = req.nextUrl.searchParams.get("dealId")

    const conds = [eq(salesConversations.tenantId, user.companyId)]
    if (dealId) conds.push(eq(salesConversations.dealId, dealId))

    const rows = await db
      .select({
        id: salesConversations.id,
        channel: salesConversations.channel,
        externalUserName: salesConversations.externalUserName,
        externalUserId: salesConversations.externalUserId,
        status: salesConversations.status,
        dealId: salesConversations.dealId,
        contactId: salesConversations.contactId,
        lastMessageAt: salesConversations.lastMessageAt,
      })
      .from(salesConversations)
      .where(and(...conds))
      .orderBy(desc(salesConversations.lastMessageAt))
      .limit(dealId ? 50 : 200)

    return apiSuccess({ conversations: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// PATCH — привязать/отвязать диалог к сделке (body: { id, dealId|null }).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()
    if (!body.id) return apiError("'id' is required", 400)

    const [updated] = await db
      .update(salesConversations)
      .set({ dealId: body.dealId || null, updatedAt: new Date() })
      .where(and(eq(salesConversations.id, body.id), eq(salesConversations.tenantId, user.companyId)))
      .returning({ id: salesConversations.id, dealId: salesConversations.dealId })
    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
