import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformSettings } from "@/lib/db/schema"

// Платформенные KV-настройки (таблица platform_settings, drizzle/0154).

export const TRASH_RETENTION_KEY = "trash_retention_days"
export const TRASH_RETENTION_DEFAULT = 7
// Допустимые значения для UI/валидации (как у корзины вакансий + 7).
export const TRASH_RETENTION_OPTIONS = [1, 3, 7, 14, 30, 60, 90] as const

export async function getPlatformSetting<T = unknown>(key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1)
  return (row?.value as T) ?? null
}

export async function setPlatformSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    })
}

// Срок авто-удаления единой Корзины (дни). Падение/отсутствие → дефолт.
export async function getTrashRetentionDays(): Promise<number> {
  try {
    const v = await getPlatformSetting<number>(TRASH_RETENTION_KEY)
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : TRASH_RETENTION_DEFAULT
  } catch {
    return TRASH_RETENTION_DEFAULT
  }
}
