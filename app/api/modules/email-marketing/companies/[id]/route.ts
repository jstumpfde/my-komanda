import { NextRequest } from "next/server"
import { and, eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { outreachCompanies, outreachContacts } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireOutreachAccess } from "@/lib/outreach/access"

// GET — полная карточка компании из базы outreach + её контакты (для боковой панели).
// Тенант-скоуп: компания обязана принадлежать user.companyId.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOutreachAccess()
    const { id } = await params

    const [company] = await db
      .select()
      .from(outreachCompanies)
      .where(and(eq(outreachCompanies.id, id), eq(outreachCompanies.companyId, user.companyId)))
      .limit(1)
    if (!company) return apiError("Компания не найдена", 404)

    const contacts = await db
      .select()
      .from(outreachContacts)
      .where(eq(outreachContacts.targetId, id))
      .orderBy(asc(outreachContacts.kind))

    return apiSuccess({ company, contacts })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[email-marketing/companies/[id]]", err)
    return apiError("Ошибка загрузки карточки", 500)
  }
}
