import { NextRequest } from "next/server"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { positions, departments, users, positionEmployees } from "@/lib/db/schema"
import { requireCompany, requireOrgManager, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/org/positions — доступно всем
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
        userId: positions.userId,
        userName: users.name,
        userAvatar: users.avatarUrl,
        createdAt: positions.createdAt,
        updatedAt: positions.updatedAt,
      })
      .from(positions)
      .leftJoin(departments, eq(positions.departmentId, departments.id))
      .leftJoin(users, eq(positions.userId, users.id))
      .where(eq(positions.tenantId, user.companyId))

    // Сотрудники на должности (вариант B — many-to-many).
    const posIds = rows.map((r) => r.id)
    const empByPos = new Map<string, { id: string; name: string; avatar: string | null }[]>()
    if (posIds.length > 0) {
      const emps = await db
        .select({
          positionId: positionEmployees.positionId,
          id: users.id,
          name: users.name,
          avatar: users.avatarUrl,
        })
        .from(positionEmployees)
        .innerJoin(users, eq(positionEmployees.userId, users.id))
        .where(inArray(positionEmployees.positionId, posIds))
      for (const e of emps) {
        const arr = empByPos.get(e.positionId) ?? []
        arr.push({ id: e.id, name: e.name, avatar: e.avatar })
        empByPos.set(e.positionId, arr)
      }
    }

    const result = rows.map((r) => ({ ...r, employees: empByPos.get(r.id) ?? [] }))
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/org/positions — только директор или manage_org_structure
export async function POST(req: NextRequest) {
  try {
    const user = await requireOrgManager()
    const body = await req.json() as {
      name: string
      departmentId?: string
      description?: string
      grade?: string
      salaryMin?: number
      salaryMax?: number
      employeeIds?: string[]
    }

    if (!body.name) return apiError("Название обязательно", 400)

    const employeeIds = Array.isArray(body.employeeIds)
      ? [...new Set(body.employeeIds.filter((x) => typeof x === "string" && x.length > 0))]
      : []

    const [created] = await db.insert(positions).values({
      tenantId: user.companyId,
      name: body.name,
      departmentId: body.departmentId ?? null,
      description: body.description ?? null,
      grade: body.grade ?? null,
      salaryMin: body.salaryMin ?? null,
      salaryMax: body.salaryMax ?? null,
      // legacy userId = первый сотрудник (обратная совместимость)
      userId: employeeIds[0] ?? null,
    }).returning()

    if (employeeIds.length > 0) {
      await db.insert(positionEmployees)
        .values(employeeIds.map((uid) => ({ positionId: created.id, userId: uid })))
        .onConflictDoNothing()
    }

    return apiSuccess({ ...created, employeeIds }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
