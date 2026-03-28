import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { buddyChecklists } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/buddy/checklists
export async function GET() {
  try {
    const user = await requireCompany()
    const rows = await db
      .select()
      .from(buddyChecklists)
      .where(eq(buddyChecklists.tenantId, user.companyId))
    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/buddy/checklists
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { title: string; items?: unknown[]; isDefault?: boolean }
    if (!body.title) return apiError("title обязателен", 400)

    const [checklist] = await db.insert(buddyChecklists).values({
      tenantId:  user.companyId,
      title:     body.title,
      items:     body.items ?? [],
      isDefault: body.isDefault ?? false,
    }).returning()

    return apiSuccess(checklist)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
