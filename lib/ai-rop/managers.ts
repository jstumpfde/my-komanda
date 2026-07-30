/**
 * Синк менеджеров Bitrix → rop_managers — порт call-agent lib/managers.ts,
 * расширен под план (п.12): полноценный синк списка + backfill имён по
 * встречающимся в rop_calls manager_id.
 *
 * ВАЖНО: синк перезаписывает name/email/isActive (реальный статус в Bitrix),
 * НО НИКОГДА не трогает excluded_from_reports/default_product/crm_sync_enabled —
 * это ручные HR-настройки (см. lib/db/schema.ts::ropManagers docblock).
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, ropManagers } from "@/lib/db/schema"
import { formatUserName, type BitrixClient } from "./bitrix"

export interface ManagerSyncResult {
  fetched: number
  created: number
  updated: number
}

/**
 * Синк конкретного списка bitrix-id менеджеров (обычно — уникальные
 * PORTAL_USER_ID из свежевыгруженных voximplant.statistic.get страниц, или
 * весь список из user.get при полном ресинке). is_active перезатирается
 * значением из Bitrix (ACTIVE!==false) — HR-флаги (excluded_from_reports и
 * пр.) сохраняются как были благодаря выборочному `set` в onConflictDoUpdate.
 */
export async function syncManagersFromBitrix(
  client: BitrixClient,
  companyId: string,
  bitrixManagerIds: Array<string | number>
): Promise<ManagerSyncResult> {
  const unique = [...new Set(bitrixManagerIds.map(String))].filter(Boolean)
  if (unique.length === 0) return { fetched: 0, created: 0, updated: 0 }

  const users = await client.usersGetBatch(unique)
  if (users.size === 0) return { fetched: 0, created: 0, updated: 0 }

  const existingRows = await db
    .select({ bitrixManagerId: ropManagers.bitrixManagerId })
    .from(ropManagers)
    .where(and(eq(ropManagers.tenantId, companyId), inArray(ropManagers.bitrixManagerId, unique)))
  const existingSet = new Set(existingRows.map((r) => r.bitrixManagerId))

  let created = 0
  let updated = 0
  for (const [bxId, u] of users) {
    const name = formatUserName(u)
    const isActive = u.ACTIVE !== false
    await db
      .insert(ropManagers)
      .values({ tenantId: companyId, bitrixManagerId: bxId, name, email: u.EMAIL ?? null, isActive })
      .onConflictDoUpdate({
        target: [ropManagers.tenantId, ropManagers.bitrixManagerId],
        set: { name, email: u.EMAIL ?? null, isActive, updatedAt: new Date() },
        // excluded_from_reports/default_product/crm_sync_enabled НЕ в set — сохраняются.
      })
    if (existingSet.has(bxId)) updated++
    else created++
  }

  return { fetched: users.size, created, updated }
}

/**
 * Проставляет managerName в rop_calls для звонков компании, у которых его
 * ещё нет (или forceAll=true — везде), используя кэш rop_managers, а для
 * незакэшированных id — догружает через Bitrix (и заодно апсертит rop_managers,
 * как syncManagersFromBitrix, с тем же щадящим onConflictDoUpdate).
 */
export async function backfillManagerNames(
  client: BitrixClient,
  companyId: string,
  opts: { forceAll?: boolean } = {}
): Promise<{ uniqueIds: number; fetched: number; updatedCalls: number }> {
  const distinctRows = await db
    .selectDistinct({ managerId: ropCalls.managerId })
    .from(ropCalls)
    .where(
      and(
        eq(ropCalls.tenantId, companyId),
        opts.forceAll
          ? undefined
          : or(isNull(ropCalls.managerName), eq(ropCalls.managerName, ""))
      )
    )
  const ids = distinctRows.map((r) => r.managerId).filter((id): id is string => !!id)
  if (ids.length === 0) return { uniqueIds: 0, fetched: 0, updatedCalls: 0 }

  const cachedRows = await db
    .select({ bitrixManagerId: ropManagers.bitrixManagerId, name: ropManagers.name, email: ropManagers.email })
    .from(ropManagers)
    .where(and(eq(ropManagers.tenantId, companyId), inArray(ropManagers.bitrixManagerId, ids)))
  const cached = new Map(cachedRows.map((r) => [r.bitrixManagerId, { name: r.name, email: r.email }]))

  const idsToFetch = ids.filter((id) => !cached.get(id)?.name)
  let fetched = 0
  if (idsToFetch.length > 0) {
    const syncRes = await syncManagersFromBitrix(client, companyId, idsToFetch)
    fetched = syncRes.fetched
    const refreshed = await db
      .select({ bitrixManagerId: ropManagers.bitrixManagerId, name: ropManagers.name, email: ropManagers.email })
      .from(ropManagers)
      .where(and(eq(ropManagers.tenantId, companyId), inArray(ropManagers.bitrixManagerId, idsToFetch)))
    for (const r of refreshed) cached.set(r.bitrixManagerId, { name: r.name, email: r.email })
  }

  let updatedCalls = 0
  for (const id of ids) {
    const name = cached.get(id)?.name
    if (!name) continue
    const rows = await db
      .update(ropCalls)
      .set({ managerName: name })
      .where(
        and(
          eq(ropCalls.tenantId, companyId),
          eq(ropCalls.managerId, id),
          opts.forceAll ? undefined : or(isNull(ropCalls.managerName), eq(ropCalls.managerName, ""))
        )
      )
      .returning({ id: ropCalls.id })
    updatedCalls += rows.length
  }

  return { uniqueIds: ids.length, fetched, updatedCalls }
}
