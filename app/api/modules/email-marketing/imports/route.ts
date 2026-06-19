import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { outreachImports } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireOutreachAccess } from "@/lib/outreach/access"

// GET — история загрузок (журнал импортов) текущей компании.
export async function GET() {
  try {
    const user = await requireOutreachAccess()
    const items = await db
      .select({
        id: outreachImports.id,
        filename: outreachImports.filename,
        sourceType: outreachImports.sourceType,
        status: outreachImports.status,
        rowsTotal: outreachImports.rowsTotal,
        rowsCreated: outreachImports.rowsCreated,
        rowsMerged: outreachImports.rowsMerged,
        rowsSkipped: outreachImports.rowsSkipped,
        contactsAdded: outreachImports.contactsAdded,
        error: outreachImports.error,
        createdAt: outreachImports.createdAt,
      })
      .from(outreachImports)
      .where(eq(outreachImports.companyId, user.companyId))
      .orderBy(desc(outreachImports.createdAt))
      .limit(50)
    return apiSuccess({ items })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка загрузки истории", 500)
  }
}
