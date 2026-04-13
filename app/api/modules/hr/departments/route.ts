import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { departments, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/departments
export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({
        id: departments.id,
        name: departments.name,
        description: departments.description,
        parentId: departments.parentId,
        headUserId: departments.headUserId,
        createdAt: departments.createdAt,
        updatedAt: departments.updatedAt,
      })
      .from(departments)
      .where(eq(departments.tenantId, user.companyId))

    // Attach parent name and head user name
    const idToName = new Map(rows.map((r) => [r.id, r.name]))

    // Fetch head user names
    const headIds = rows.map((r) => r.headUserId).filter(Boolean) as string[]
    let headMap = new Map<string, string>()
    if (headIds.length > 0) {
      const headUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users)
      headMap = new Map(headUsers.map((u) => [u.id, u.name ?? ""]))
    }

    const result = rows.map((r) => ({
      ...r,
      parentName: r.parentId ? idToName.get(r.parentId) ?? null : null,
      headUserName: r.headUserId ? headMap.get(r.headUserId) ?? null : null,
    }))

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/departments
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      name: string
      description?: string
      parentId?: string
      headUserId?: string
    }

    if (!body.name) return apiError("Название обязательно", 400)

    const [created] = await db.insert(departments).values({
      tenantId: user.companyId,
      name: body.name,
      description: body.description ?? null,
      parentId: body.parentId ?? null,
      headUserId: body.headUserId ?? null,
    }).returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
