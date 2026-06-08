// Создание предварительной брони из распознанного подтверждения клиента.
//
// Безопасность (принцип «рискованное → через подтверждение»): по умолчанию бронь
// создаётся со статусом "pending" (ожидает подтверждения администратора). Если в
// настройках бота booking.autoConfirm=true — сразу "confirmed".
//
// Резолвит услугу/мастера из booking-справочников салона, проверяет конфликт по
// времени, пишет строку в bookings. НЕ выдумывает услуги — если услуга не найдена
// в данных салона, бронь не создаётся.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookingServices, bookingResources, bookings } from "@/lib/db/schema"
import type { BookingExtraction } from "./booking-extraction"

export interface CreateBookingResult {
  created: boolean
  reason?: string
  status?: "pending" | "confirmed"
  confirmationText?: string
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor((total % (24 * 60)) / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`
}

// YYYY-MM-DD → DD.MM для человекочитаемого подтверждения.
function fmtDate(iso: string): string {
  const [y, mo, d] = iso.split("-")
  return d && mo ? `${d}.${mo}` : iso
}

export async function createBookingFromExtraction(params: {
  tenantId: string
  extraction: BookingExtraction
  contactId?: string | null
  clientName?: string | null
  autoConfirm: boolean
  slotTakenMessage?: string | null
}): Promise<CreateBookingResult> {
  const { tenantId, extraction, contactId, clientName, autoConfirm } = params

  if (!extraction.shouldBook || !extraction.serviceName || !extraction.date || !extraction.time) {
    return { created: false, reason: "incomplete" }
  }

  // ── Резолв услуги по названию (без учёта регистра, по вхождению) ──
  const services = await db
    .select()
    .from(bookingServices)
    .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.isActive, true)))

  const want = extraction.serviceName.toLowerCase().trim()
  const svc =
    services.find((s) => s.name.toLowerCase() === want) ??
    services.find(
      (s) => s.name.toLowerCase().includes(want) || want.includes(s.name.toLowerCase()),
    )
  if (!svc) return { created: false, reason: "service_not_found" }

  // ── Резолв мастера (опционально) ──
  let resourceId: string | null = null
  if (extraction.masterName) {
    const resources = await db
      .select()
      .from(bookingResources)
      .where(and(eq(bookingResources.tenantId, tenantId), eq(bookingResources.isActive, true)))
    const wm = extraction.masterName.toLowerCase().trim()
    const r =
      resources.find((x) => x.name.toLowerCase() === wm) ??
      resources.find((x) => x.name.toLowerCase().includes(wm))
    resourceId = r?.id ?? null
  }

  const duration = svc.duration ?? 60
  const startTime = extraction.time
  const endTime = addMinutes(startTime, duration)
  const date = extraction.date

  // ── Проверка конфликта по времени (если назначен мастер) ──
  if (resourceId) {
    const dayBookings = await db
      .select({ st: bookings.startTime, et: bookings.endTime, status: bookings.status })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          eq(bookings.resourceId, resourceId),
          eq(bookings.date, date),
        ),
      )
    const conflict = dayBookings.some(
      (b) => b.status !== "cancelled" && b.st < endTime && b.et > startTime,
    )
    if (conflict) {
      return {
        created: false,
        reason: "slot_taken",
        confirmationText:
          params.slotTakenMessage ||
          "Ой, это время только что заняли. Давайте подберём другое удобное время?",
      }
    }
  }

  const status: "pending" | "confirmed" = autoConfirm ? "confirmed" : "pending"

  await db.insert(bookings).values({
    tenantId,
    serviceId: svc.id,
    resourceId,
    contactId: contactId ?? null,
    clientName: clientName ?? "Клиент",
    date,
    startTime,
    endTime,
    status,
    notes: "Создано AI-ботом продаж",
    price: svc.price ?? null,
  })

  const priceText = svc.price != null ? ` (${Math.round(svc.price / 100)}₽)` : ""
  const confirmationText =
    status === "confirmed"
      ? `Готово! Записала вас: ${svc.name}${priceText}, ${fmtDate(date)} в ${startTime}. Ждём вас!`
      : `Предварительно записала вас: ${svc.name}${priceText}, ${fmtDate(date)} в ${startTime}. Администратор подтвердит запись и свяжется с вами.`

  return { created: true, status, confirmationText }
}
