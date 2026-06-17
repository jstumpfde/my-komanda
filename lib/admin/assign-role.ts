// Назначение «типа доступа» пользователю из админки (СЕРВЕРНЫЙ модуль — тянет db).
//
// Модель ролей:
//   - Клиентские роли (director/hr_lead/hr_manager/department_head/observer/client)
//     хранятся прямо в users.role — без записи в integrators.
//   - «Партнёр / Суб-партнёр / Реферал / Суб-реферал» — это users.role='partner' +
//     запись в integrators с нужным kind.
//
// Чистые константы/типы (AccessType, *_ACCESS_TYPES, PARTNER_KIND, …) вынесены в
// lib/admin/access-types.ts (client-safe) и реэкспортируются отсюда для серверных
// потребителей, импортирующих из "@/lib/admin/assign-role".

import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { integrators, integratorClients } from "@/lib/db/schema"
import { PARTNER_KIND, type AccessType } from "@/lib/admin/access-types"

export * from "@/lib/admin/access-types"

// Если назначен партнёрский тип — создаём/обновляем integrators для companyId
// пользователя с нужным kind. companyId у integrators уникален (один integrator
// на компанию): если запись есть — обновляем kind (и возвращаем в active), иначе
// создаём (status='active').
//
// При возврате пользователя в КЛИЕНТСКУЮ роль деактивируем его integrator
// (status='terminated') и отменяем его integrator_clients (status='cancelled'),
// чтобы не оставался «призрачный кабинет» партнёра с доступом к клиентам.
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
