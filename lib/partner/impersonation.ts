// «Войти как клиент» — impersonation партнёром (Group 14 / Partner program).
//
// SECURITY-КРИТИЧНО: getActingAs() вызывается в session callback (auth.ts) на
// КАЖДОМ запросе партнёра. Поэтому: ранний выход без куки, fail-safe (любая
// осечка → null), и на каждом запросе перепроверка владения+active в БД.
//
// Эффективная компания партнёра подменяется ТОЛЬКО в session (не в JWT-токене):
// реальная личность партнёра остаётся в token.companyId.
//
// Крипто/формат куки вынесены в impersonation-cookie.ts (без next/headers и db),
// чтобы middleware мог проверять подпись, не затаскивая БД-драйвер в бандл.

import { cookies } from "next/headers"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { integrators, integratorClients, companies, users } from "@/lib/db/schema"
import {
  ACTING_AS_COOKIE,
  encodeActingAs,
  verifyAndDecodeActingAs,
  type ActingAsPayload,
} from "@/lib/partner/impersonation-cookie"

// Реэкспорт для удобства существующих импортов.
export {
  ACTING_AS_COOKIE,
  encodeActingAs,
  verifyAndDecodeActingAs,
  type ActingAsPayload,
}

export interface ActingAsResolved {
  clientCompanyId: string
  integratorId: string
  realUserId: string
  clientName: string
}

// Читает куку, проверяет подпись, ПОТОМ перепроверяет владение в БД.
// Любая осечка → null (fail-safe): companyId остаётся партнёрским.
// Вызывается в session callback на каждом запросе партнёра.
export async function getActingAs(): Promise<ActingAsResolved | null> {
  let raw: string | undefined
  try {
    const store = await cookies()
    raw = store.get(ACTING_AS_COOKIE)?.value
  } catch {
    return null
  }
  // Ранний дешёвый выход — нет куки.
  if (!raw) return null

  const payload = verifyAndDecodeActingAs(raw)
  if (!payload) return null

  try {
    // 1) Пользователь существует и роль 'partner'.
    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, payload.realUserId))
      .limit(1)
    if (!user || user.role !== "partner") return null

    // 2) Integrator существует и активен.
    const [integrator] = await db
      .select({ id: integrators.id, status: integrators.status })
      .from(integrators)
      .where(eq(integrators.id, payload.integratorId))
      .limit(1)
    if (!integrator || integrator.status !== "active") return null

    // 3) Integrator владеет этим клиентом и связь активна.
    const [link] = await db
      .select({ id: integratorClients.id })
      .from(integratorClients)
      .where(and(
        eq(integratorClients.integratorId, payload.integratorId),
        eq(integratorClients.clientCompanyId, payload.clientCompanyId),
        eq(integratorClients.status, "active"),
      ))
      .limit(1)
    if (!link) return null

    // 4) Имя клиента (для баннера).
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, payload.clientCompanyId))
      .limit(1)
    if (!company) return null

    return {
      clientCompanyId: payload.clientCompanyId,
      integratorId: payload.integratorId,
      realUserId: payload.realUserId,
      clientName: company.name,
    }
  } catch {
    // БД-осечка → не применяем impersonation.
    return null
  }
}

// Пишет подписанную httpOnly-куку. Вызывать из server-action.
export async function setActingAs(payload: Omit<ActingAsPayload, "issuedAt">): Promise<void> {
  const full: ActingAsPayload = { ...payload, issuedAt: Date.now() }
  const store = await cookies()
  store.set(ACTING_AS_COOKIE, encodeActingAs(full), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

// Удаляет куку. Вызывать из server-action выхода.
export async function clearActingAs(): Promise<void> {
  const store = await cookies()
  store.delete(ACTING_AS_COOKIE)
}

// Бросает, если партнёр НЕ владеет клиентом или integrator/связь не active.
// Обёртка поверх БД-проверки — НЕ трогает существующий assertPartnerOwnsClient.
export async function assertPartnerOwnsClientActive(
  integratorId: string,
  clientCompanyId: string,
): Promise<void> {
  const [integrator] = await db
    .select({ id: integrators.id, status: integrators.status })
    .from(integrators)
    .where(eq(integrators.id, integratorId))
    .limit(1)
  if (!integrator || integrator.status !== "active") {
    throw new Error("Партнёрский аккаунт неактивен")
  }
  const [link] = await db
    .select({ id: integratorClients.id })
    .from(integratorClients)
    .where(and(
      eq(integratorClients.integratorId, integratorId),
      eq(integratorClients.clientCompanyId, clientCompanyId),
      eq(integratorClients.status, "active"),
    ))
    .limit(1)
  if (!link) {
    throw new Error("Клиент не найден у этого партнёра или связь неактивна")
  }
}
