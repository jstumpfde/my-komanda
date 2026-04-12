import { NextRequest } from "next/server"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, bookingServices, bookingResources } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const sp = req.nextUrl.searchParams
    const dateFilter = sp.get("date")
    const dateFrom = sp.get("dateFrom")
    const dateTo = sp.get("dateTo")
    const resourceFilter = sp.get("resourceId")
    const statusFilter = sp.get("status")

    const conditions = [eq(bookings.tenantId, user.companyId)]

    if (dateFilter) {
      conditions.push(eq(bookings.date, dateFilter))
    }
    if (dateFrom) {
      conditions.push(gte(bookings.date, dateFrom))
    }
    if (dateTo) {
      conditions.push(lte(bookings.date, dateTo))
    }
    if (resourceFilter && resourceFilter !== "all") {
      conditions.push(eq(bookings.resourceId, resourceFilter))
    }
    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(bookings.status, statusFilter))
    }

    const rows = await db
      .select({
        id: bookings.id,
        serviceId: bookings.serviceId,
        resourceId: bookings.resourceId,
        contactId: bookings.contactId,
        clientName: bookings.clientName,
        clientPhone: bookings.clientPhone,
        clientEmail: bookings.clientEmail,
        date: bookings.date,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        status: bookings.status,
        notes: bookings.notes,
        price: bookings.price,
        isPaid: bookings.isPaid,
        createdAt: bookings.createdAt,
        serviceName: bookingServices.name,
        serviceColor: bookingServices.color,
        serviceDuration: bookingServices.duration,
        resourceName: bookingResources.name,
      })
      .from(bookings)
      .leftJoin(bookingServices, eq(bookings.serviceId, bookingServices.id))
      .leftJoin(bookingResources, eq(bookings.resourceId, bookingResources.id))
      .where(and(...conditions))
      .orderBy(bookings.date, bookings.startTime)

    return apiSuccess({ bookings: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json()

    if (!body.serviceId) return apiError("'serviceId' is required", 400)
    if (!body.clientName?.trim()) return apiError("'clientName' is required", 400)
    if (!body.date) return apiError("'date' is required", 400)
    if (!body.startTime) return apiError("'startTime' is required", 400)
    if (!body.endTime) return apiError("'endTime' is required", 400)

    // Проверка конфликтов
    if (body.resourceId) {
      const conflicts = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, user.companyId),
            eq(bookings.resourceId, body.resourceId),
            eq(bookings.date, body.date),
            eq(bookings.status, "confirmed"),
            sql`${bookings.startTime} < ${body.endTime}`,
            sql`${bookings.endTime} > ${body.startTime}`,
          ),
        )
      if (conflicts.length > 0) {
        return apiError("Выбранное время уже занято", 409)
      }
    }

    const [booking] = await db
      .insert(bookings)
      .values({
        tenantId: user.companyId,
        serviceId: body.serviceId,
        resourceId: body.resourceId || null,
        contactId: body.contactId || null,
        clientName: body.clientName.trim(),
        clientPhone: body.clientPhone || null,
        clientEmail: body.clientEmail || null,
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        status: "confirmed",
        notes: body.notes || null,
        price: body.price ?? null,
        isPaid: body.isPaid ?? false,
      })
      .returning()

    return apiSuccess(booking, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
