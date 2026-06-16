// Назначение «типа доступа» пользователю из админки.
//
// Модель ролей:
//   - Клиентские роли (director/hr_lead/hr_manager/department_head/observer/client)
//     хранятся прямо в users.role — без записи в integrators.
//   - «Партнёр / Суб-партнёр / Реферал» — это users.role='partner' + запись в
//     integrators для companyId пользователя с нужным kind:
//       Партнёр      → role='partner' + integrator(kind='partner')
//       Суб-партнёр  → role='partner' + integrator(kind='sub_partner')
//       Реферал      → role='partner' + integrator(kind='referral')
//
// UI оперирует «типом доступа» (accessType). Здесь раскладываем его на
// users.role + (опционально) integrators.kind.

import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { integrators, integratorClients } from "@/lib/db/schema"

// Тип доступа, как его выбирает админ в UI.
// Клиентские роли совпадают со значением users.role; партнёрские — это
// разложение на role='partner' + integrators.kind.
export type AccessType =
  | "director"
  | "client"
  | "hr_lead"
  | "hr_manager"
  | "department_head"
  | "observer"
  | "tester_hr"
  | "partner"      // Партнёр
  | "sub_partner"  // Суб-партнёр
  | "referral"     // Реферал

export const CLIENT_ACCESS_TYPES: AccessType[] = [
  "director", "client", "hr_lead", "hr_manager", "department_head", "observer", "tester_hr",
]
export const PARTNER_ACCESS_TYPES: AccessType[] = ["partner", "sub_partner", "referral"]

export const ALL_ACCESS_TYPES: AccessType[] = [...CLIENT_ACCESS_TYPES, ...PARTNER_ACCESS_TYPES]

export function isAccessType(v: unknown): v is AccessType {
  return typeof v === "string" && (ALL_ACCESS_TYPES as string[]).includes(v)
}

const PARTNER_KIND: Record<string, "partner" | "sub_partner" | "referral"> = {
  partner: "partner",
  sub_partner: "sub_partner",
  referral: "referral",
}

// Раскладываем тип доступа в users.role.
export function accessTypeToUserRole(accessType: AccessType): string {
  if ((PARTNER_ACCESS_TYPES as string[]).includes(accessType)) return "partner"
  return accessType
}

// Если назначен партнёрский тип — создаём/обновляем integrators для companyId
// пользователя с нужным kind. companyId у integrators уникален (один integrator
// на компанию): если запись есть — обновляем kind (и возвращаем в active), иначе
// создаём (status='active').
//
// При возврате пользователя в КЛИЕНТСКУЮ роль деактивируем его integrator
// (status='terminated') и отменяем его integrator_clients (status='cancelled'),
// чтобы не оставался «призрачный кабинет» партнёра с доступом к клиентам.
//
// Возвращает применённый users.role (для записи в БД вызывающим кодом).
export async function syncIntegratorForAccessType(
  accessType: AccessType,
  companyId: string | null,
): Promise<void> {
  const kind = PARTNER_KIND[accessType]

  // Клиентская роль — гасим партнёрский кабинет (если он был у компании).
  if (!kind) {
    if (!companyId) return
    const [existing] = await db
      .select({ id: integrators.id })
      .from(integrators)
      .where(eq(integrators.companyId, companyId))
      .limit(1)
    if (!existing) return
    await db.transaction(async (tx) => {
      await tx
        .update(integrators)
        .set({ status: "terminated" })
        .where(eq(integrators.id, existing.id))
      await tx
        .update(integratorClients)
        .set({ status: "cancelled" })
        .where(and(
          eq(integratorClients.integratorId, existing.id),
          ne(integratorClients.status, "cancelled"),
        ))
    })
    return
  }

  if (!companyId) {
    // Партнёрство привязано к компании; без неё integrator создать нельзя.
    throw new Error("Для партнёрского доступа у пользователя должна быть компания")
  }

  const [existing] = await db
    .select({ id: integrators.id })
    .from(integrators)
    .where(eq(integrators.companyId, companyId))
    .limit(1)

  if (existing) {
    // Возвращаем партнёра в строй: kind + status='active' (мог быть terminated).
    await db.update(integrators).set({ kind, status: "active" }).where(eq(integrators.id, existing.id))
  } else {
    await db.insert(integrators).values({
      companyId,
      kind,
      status: "active",
    })
  }
}
