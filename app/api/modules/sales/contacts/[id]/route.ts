import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesContacts, salesCompanies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [contact] = await db
      .select()
      .from(salesContacts)
      .where(and(eq(salesContacts.id, id), eq(salesContacts.tenantId, user.companyId)))

    if (!contact) return apiError("Not found", 404)

    let company = null
    if (contact.companyId) {
      const [c] = await db
        .select()
        .from(salesCompanies)
        .where(eq(salesCompanies.id, contact.companyId))
      company = c || null
    }

    return apiSuccess({ ...contact, company })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
