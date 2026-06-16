"use server"

import { redirect } from "next/navigation"
import { requirePartner } from "@/lib/partner/access"
import {
  assertPartnerOwnsClientActive,
  setActingAs,
  clearActingAs,
  getActingAs,
} from "@/lib/partner/impersonation"
import { logAudit } from "@/lib/audit/log"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Партнёр входит в кабинет клиента («Войти как клиент»).
// Полный доступ как директор клиента (решение владельца). Только внутренний аудит.
export async function enterClientImpersonation(clientCompanyId: string): Promise<void> {
  if (!clientCompanyId) throw new Error("Не указан клиент")

  const { user, integrator } = await requirePartner()

  // SECURITY: реферал — view-only. НЕ может входить в кабинет клиента даже
  // прямым вызовом server-action (UI-кнопка скрыта, но гейт обязателен здесь).
  if (integrator.kind === "referral") {
    throw new Error("Реферал не может входить в кабинет клиента")
  }

  // Перепроверка владения + active (бросает при осечке).
  await assertPartnerOwnsClientActive(integrator.id, clientCompanyId)

  // Имя клиента для лога (мягко — не блокируем при осечке).
  let clientName: string | null = null
  try {
    const [c] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, clientCompanyId))
      .limit(1)
    clientName = c?.name ?? null
  } catch {
    /* имя не критично */
  }

  await setActingAs({
    clientCompanyId,
    integratorId: integrator.id,
    realUserId: user.id,
  })

  await logAudit({
    action: "impersonation_start",
    tenantId: clientCompanyId,
    userId: user.id,
    userEmail: user.email ?? null,
    entityType: "company",
    entityId: clientCompanyId,
    meta: {
      integratorId: integrator.id,
      realCompanyId: integrator.companyId,
      clientName,
    },
  })

  redirect("/")
}

// Партнёр выходит из режима impersonation обратно в свой кабинет.
export async function exitClientImpersonation(): Promise<void> {
  // Снимок текущей impersonation для аудита (до очистки куки).
  const acting = await getActingAs()
  await clearActingAs()

  if (acting) {
    await logAudit({
      action: "impersonation_end",
      tenantId: acting.clientCompanyId,
      userId: acting.realUserId,
      // email недоступен дёшево здесь — оставляем null, личность в userId.
      entityType: "company",
      entityId: acting.clientCompanyId,
      meta: {
        integratorId: acting.integratorId,
        clientName: acting.clientName,
      },
    })
  }

  redirect("/partner")
}
