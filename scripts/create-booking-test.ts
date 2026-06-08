import { readFileSync } from "node:fs"
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

async function main() {
  const { db } = await import("@/lib/db")
  const { companies, bookingServices, bookings } = await import("@/lib/db/schema")
  const { createBookingFromExtraction } = await import("@/lib/sales/create-booking")
  const { eq, and } = await import("drizzle-orm")

  const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).limit(1)
  if (!company) { console.log("нет компаний в локальной БД"); return }
  console.log("tenant:", company.name, company.id)

  // Гарантируем тест-услугу
  const svcName = "Тест-Маникюр-AI"
  let [svc] = await db.select().from(bookingServices)
    .where(and(eq(bookingServices.tenantId, company.id), eq(bookingServices.name, svcName))).limit(1)
  if (!svc) {
    ;[svc] = await db.insert(bookingServices).values({
      tenantId: company.id, name: svcName, duration: 60, price: 150000, currency: "RUB", isActive: true,
    }).returning()
    console.log("создана тест-услуга", svc.id)
  }

  const res = await createBookingFromExtraction({
    tenantId: company.id,
    extraction: { shouldBook: true, serviceName: svcName, date: "2026-06-10", time: "15:00", masterName: null, confidence: 0.95 },
    contactId: null,
    clientName: "Тестовый Клиент",
    autoConfirm: false,
  })
  console.log("createBooking result:", JSON.stringify(res))

  const [created] = await db.select({ date: bookings.date, st: bookings.startTime, et: bookings.endTime, status: bookings.status, notes: bookings.notes })
    .from(bookings)
    .where(and(eq(bookings.tenantId, company.id), eq(bookings.serviceId, svc.id)))
    .limit(5)
  console.log("строка в bookings:", JSON.stringify(created))
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1) })
