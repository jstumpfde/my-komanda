// Фиче-флаг «Подключённые источники» (концепт kb-connected-sources §risks —
// 152-ФЗ жёсткий гейт). Default OFF для всех компаний; включается точечно
// per-company (companies.hiringDefaultsJson.knowledgeDriveSourcesEnabled) или
// автоматически видно владельцу-полигону (lib/owner.ts).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { isOwnerEmail } from "@/lib/owner"

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
