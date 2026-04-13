import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { positions, departments } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/org/positions
export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({
        id: positions.id,
        name: positions.name,
        description: positions.description,
        departmentId: positions.departmentId,
        departmentName: departments.name,
        grade: positions.grade,
        salaryMin: positions.salaryMin,
        salaryMax: positions.salaryMax,
        createdAt: positions.createdAt,
        updatedAt: positions.updatedAt,
      })
      .from(positions)
      .leftJoin(departments, eq(positions.departmentId, departments.id))
      .where(eq(positions.tenantId, user.companyId))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/org/positions
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      name: string
      departmentId?: string
      description?: string
      grade?: string
      salaryMin?: number
      salaryMax?: number
    }

    if (!body.name) return apiError("Название обязательно", 400)

    const [created] = await db.insert(positions).values({
      tenantId: user.companyId,
      name: body.name,
      departmentId: body.departmentId ?? null,
      description: body.description ?? null,
      grade: body.grade ?? null,
      salaryMin: body.salaryMin ?? null,
      salaryMax: body.salaryMax ?? null,
    }).returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
