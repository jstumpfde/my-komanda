import { NextRequest } from "next/server"
import { eq, and, ilike, or, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesContacts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const sp = req.nextUrl.searchParams

    const companyId = sp.get("company_id")
    const search = sp.get("search")
    const statusFilter = sp.get("status")

    const conditions = [eq(salesContacts.tenantId, user.companyId)]

    if (companyId && companyId !== "all") {
      conditions.push(eq(salesContacts.companyId, companyId))
    }
    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(salesContacts.status, statusFilter))
    }
    if (search) {
      conditions.push(
        or(
          ilike(salesContacts.firstName, `%${search}%`),
          ilike(salesContacts.lastName, `%${search}%`),
          ilike(salesContacts.email, `%${search}%`),
          ilike(salesContacts.phone, `%${search}%`),
        )!,
      )
    }

    const where = and(...conditions)

    const [totalResult] = await db
      .select({ value: count() })
      .from(salesContacts)
      .where(where)

    const rows = await db
      .select()
      .from(salesContacts)
      .where(where)
      .orderBy(salesContacts.createdAt)

    return apiSuccess({ contacts: rows, total: totalResult?.value ?? 0 })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.first_name?.trim() || !body.last_name?.trim()) {
      return apiError("'first_name' and 'last_name' are required", 400)
    }

    const [contact] = await db
      .insert(salesContacts)
      .values({
        tenantId: user.companyId,
        companyId: body.company_id || null,
        firstName: body.first_name.trim(),
        lastName: body.last_name.trim(),
        middleName: body.middle_name || null,
        position: body.position || null,
        department: body.department || null,
        phone: body.phone || null,
        mobile: body.mobile || null,
        email: body.email || null,
        telegram: body.telegram || null,
        whatsapp: body.whatsapp || null,
        comment: body.comment || null,
        isPrimary: body.is_primary || false,
        status: "active",
      })
      .returning()

    return apiSuccess(contact, 201)
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
      .update(salesContacts)
      .set({
        ...(body.first_name && { firstName: body.first_name }),
        ...(body.last_name && { lastName: body.last_name }),
        ...(body.middle_name !== undefined && { middleName: body.middle_name }),
        ...(body.company_id !== undefined && { companyId: body.company_id }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.department !== undefined && { department: body.department }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.mobile !== undefined && { mobile: body.mobile }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.telegram !== undefined && { telegram: body.telegram }),
        ...(body.whatsapp !== undefined && { whatsapp: body.whatsapp }),
        ...(body.comment !== undefined && { comment: body.comment }),
        ...(body.is_primary !== undefined && { isPrimary: body.is_primary }),
        ...(body.status !== undefined && { status: body.status }),
        updatedAt: new Date(),
      })
      .where(and(eq(salesContacts.id, body.id), eq(salesContacts.tenantId, user.companyId)))
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
      .update(salesContacts)
      .set({ status: "archive", updatedAt: new Date() })
      .where(and(eq(salesContacts.id, body.id), eq(salesContacts.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
