// Резолв реквизитов канала per-tenant.
//
// Функции достают строку salesChannelAccounts из БД и конвертируют
// её в ChannelCredentials для передачи адаптеру. Бизнес-логика
// работает через эти хелперы — не лезет в таблицу напрямую.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesChannelAccounts } from "@/lib/db/schema"
import type { ChannelCredentials, ChannelType } from "./types"

// Тип строки аккаунта канала (инферируется из схемы Drizzle).
export type ChannelAccount = typeof salesChannelAccounts.$inferSelect

// Найти аккаунт канала по первичному ключу.
export async function getChannelAccountById(
  accountId: string,
): Promise<ChannelAccount | null> {
  const [row] = await db
    .select()
    .from(salesChannelAccounts)
    .where(eq(salesChannelAccounts.id, accountId))
    .limit(1)

  return row ?? null
}

// Найти первый активный аккаунт тенанта для указанного канала.
export async function getChannelAccount(
  tenantId: string,
  channel: ChannelType,
): Promise<ChannelAccount | null> {
  const [row] = await db
    .select()
    .from(salesChannelAccounts)
    .where(
      and(
        eq(salesChannelAccounts.tenantId, tenantId),
        eq(salesChannelAccounts.channel, channel),
        eq(salesChannelAccounts.isActive, true),
      ),
    )
    .limit(1)

  return row ?? null
}

// Сконвертировать строку аккаунта в ChannelCredentials для адаптера.
// Поля, которых нет в таблице (произвольные провайдерские ключи),
// адаптер должен брать из account.config напрямую — здесь не пробрасываем.
export function toCredentials(account: ChannelAccount): ChannelCredentials {
  return {
    ...(account.botToken        ? { botToken:          account.botToken }        : {}),
    ...(account.fromAddress     ? { fromAddress:        account.fromAddress }     : {}),
    ...(account.externalAccountId ? { externalAccountId: account.externalAccountId } : {}),
  }
}
