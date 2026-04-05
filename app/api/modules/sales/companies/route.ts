import { NextRequest } from "next/server"
import { eq, and, ilike, or, count, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesCompanies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const sp = req.nextUrl.searchParams

    const typeFilter = sp.get("type")
    const statusFilter = sp.get("status")
    const search = sp.get("search")

    const conditions = [eq(salesCompanies.tenantId, user.companyId)]

    if (typeFilter && typeFilter !== "all") {
      conditions.push(eq(salesCompanies.type, typeFilter))
    }
    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(salesCompanies.status, statusFilter))
    }
    if (search) {
      conditions.push(
        or(
          ilike(salesCompanies.name, `%${search}%`),
          ilike(salesCompanies.inn, `%${search}%`),
          ilike(salesCompanies.city, `%${search}%`),
        )!,
      )
    }

    const where = and(...conditions)

    const [totalResult] = await db
      .select({ value: count() })
      .from(salesCompanies)
      .where(where)

    const rows = await db
      .select()
      .from(salesCompanies)
      .where(where)
      .orderBy(salesCompanies.createdAt)

    return apiSuccess({ companies: rows, total: totalResult?.value ?? 0 })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.name?.trim()) {
      return apiError("'name' is required", 400)
    }

    const [company] = await db
      .insert(salesCompanies)
      .values({
        tenantId: user.companyId,
        name: body.name.trim(),
        inn: body.inn || null,
        kpp: body.kpp || null,
        ogrn: body.ogrn || null,
        industry: body.industry || null,
        city: body.city || null,
        address: body.address || null,
        website: body.website || null,
        phone: body.phone || null,
        email: body.email || null,
        revenue: body.revenue || null,
        employeesCount: body.employees_count || null,
        description: body.description || null,
        logoUrl: body.logo_url || null,
        type: body.type || "client",
        status: "active",
      })
      .returning()

    return apiSuccess(company, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.id) return apiError("'id' is required", 400)

    const [updated] = await db
      .update(salesCompanies)
      .set({
        ...(body.name && { name: body.name }),
        ...(body.inn !== undefined && { inn: body.inn }),
        ...(body.kpp !== undefined && { kpp: body.kpp }),
        ...(body.ogrn !== undefined && { ogrn: body.ogrn }),
        ...(body.industry !== undefined && { industry: body.industry }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.website !== undefined && { website: body.website }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.revenue !== undefined && { revenue: body.revenue }),
        ...(body.employees_count !== undefined && { employeesCount: body.employees_count }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.status !== undefined && { status: body.status }),
        updatedAt: new Date(),
      })
      .where(and(eq(salesCompanies.id, body.id), eq(salesCompanies.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.id) return apiError("'id' is required", 400)

    const [updated] = await db
      .update(salesCompanies)
      .set({ status: "archive", updatedAt: new Date() })
      .where(and(eq(salesCompanies.id, body.id), eq(salesCompanies.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
