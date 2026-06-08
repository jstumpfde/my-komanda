// Загрузка конфигурации sales-чатбота на уровне салона (тенанта).
// Одна строка sales_bot_configs на тенант (UNIQUE tenant_id).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesBotConfigs } from "@/lib/db/schema"

export type SalesBotConfig = typeof salesBotConfigs.$inferSelect

export async function getSalesBotConfig(tenantId: string): Promise<SalesBotConfig | null> {
  const [row] = await db
    .select()
    .from(salesBotConfigs)
    .where(eq(salesBotConfigs.tenantId, tenantId))
    .limit(1)

  return row ?? null
}
