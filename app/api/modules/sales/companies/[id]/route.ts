import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesCompanies, salesContacts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [company] = await db
      .select()
      .from(salesCompanies)
      .where(and(eq(salesCompanies.id, id), eq(salesCompanies.tenantId, user.companyId)))

    if (!company) return apiError("Not found", 404)

    const contacts = await db
      .select()
      .from(salesContacts)
      .where(and(eq(salesContacts.companyId, id), eq(salesContacts.tenantId, user.companyId)))

    return apiSuccess({ ...company, contacts })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
