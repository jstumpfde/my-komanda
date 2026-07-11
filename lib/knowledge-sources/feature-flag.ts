// Фиче-флаг «Подключённые источники» (концепт kb-connected-sources §risks —
// 152-ФЗ жёсткий гейт). Default OFF для всех компаний; включается точечно
// per-company (companies.hiringDefaultsJson.knowledgeDriveSourcesEnabled) или
// автоматически видно владельцу-полигону (lib/owner.ts).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { isOwnerEmail } from "@/lib/owner"
import { apiError } from "@/lib/api-helpers"

export async function isKnowledgeDriveSourcesEnabled(
  companyId: string,
  userEmail?: string | null,
): Promise<boolean> {
  if (isOwnerEmail(userEmail)) return true
  try {
    const [row] = await db
      .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    return row?.hiringDefaultsJson?.knowledgeDriveSourcesEnabled === true
  } catch (err) {
    console.error("[knowledge-sources] feature-flag check failed", err)
    return false
  }
}

/**
 * Гейт для API-роутов источников: бросает готовый Response 403, если фича
 * не включена для компании. Вызывать СРАЗУ после requireCompany/
 * requireDirector в КАЖДОМ роуте источников (ревью 11.07, MAJOR-1: флаг
 * обходился прямыми URL — проверялся только списочный GET/POST).
 */
export async function assertKnowledgeDriveSourcesEnabled(
  user: { companyId: string; email?: string | null },
): Promise<void> {
  const enabled = await isKnowledgeDriveSourcesEnabled(user.companyId, user.email)
  if (!enabled) {
    throw apiError("«Подключённые источники» пока недоступны для вашей компании", 403)
  }
}

/**
 * Для крона (нет пользователя в контексте): фича включена для компании, если
 * company-флаг взведён ИЛИ источник подключал владелец-полигон (connectedBy →
 * users.email в OWNER_EMAILS) — иначе полигонные источники, работающие через
 * owner-гейт без company-флага, переставали бы синкаться. Выключили флаг →
 * источник перестаёт синкаться со следующего тика (MAJOR-1 из ревью).
 */
export function isEnabledForCron(
  hiringDefaultsJson: { knowledgeDriveSourcesEnabled?: boolean } | null | undefined,
  connectedByEmail: string | null | undefined,
): boolean {
  if (hiringDefaultsJson?.knowledgeDriveSourcesEnabled === true) return true
  return isOwnerEmail(connectedByEmail)
}
