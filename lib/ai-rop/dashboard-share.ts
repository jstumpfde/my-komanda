/**
 * Публичная ссылка на дашборд AI-РОП — токен хранится в rop_report_shares
 * (по образцу reportShares у HR-отчёта, см. app/api/modules/hr/report/share/
 * route.ts — своя таблица AI-РОП, т.к. независимый цикл отзыва токена, план
 * п.10). Любой кто знает URL `/rop-report/[token]` (фаза 4, UI) видит
 * read-only дашборд компании.
 *
 * Безопасность: токен длиной 24 байта (192 бит) base64url-кодирован → 32
 * символа. Бруте-форсить нереально. Отзыв = revokedAt проставляется у
 * старого токена; «перегенерировать» = отозвать старый + создать новый (один
 * активный токен на компанию, как в оригинале call-agent lib/dashboard-share.ts,
 * который хранил токен в tenants.settings — здесь отдельная таблица с
 * ревизионной историей вместо перезаписи одного поля).
 */
import { randomBytes } from "crypto"
import { and, eq, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropReportShares } from "@/lib/db/schema"

/** Текущий активный токен компании (или null, если ещё не генерировался). */
export async function getActiveShareToken(companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: ropReportShares.token })
    .from(ropReportShares)
    .where(and(eq(ropReportShares.companyId, companyId), isNull(ropReportShares.revokedAt)))
    .orderBy(desc(ropReportShares.createdAt))
    .limit(1)
  return row?.token ?? null
}

/**
 * Сгенерировать новый токен (отзывает предыдущий активный — один активный
 * токен на компанию). Возвращает новый токен.
 */
export async function regenerateShareToken(companyId: string, createdBy?: string | null): Promise<string> {
  await db
    .update(ropReportShares)
    .set({ revokedAt: new Date() })
    .where(and(eq(ropReportShares.companyId, companyId), isNull(ropReportShares.revokedAt)))

  const token = randomBytes(24).toString("base64url")
  await db.insert(ropReportShares).values({
    token,
    companyId,
    createdBy: createdBy ?? null,
  })
  return token
}

/** Отозвать активный токен компании. После этого `/rop-report/[token]` для него не работает. */
export async function revokeShareToken(companyId: string): Promise<void> {
  await db
    .update(ropReportShares)
    .set({ revokedAt: new Date() })
    .where(and(eq(ropReportShares.companyId, companyId), isNull(ropReportShares.revokedAt)))
}

/** Обратное преобразование: найти companyId по токену (для публичного роута), только если не отозван. */
export async function resolveCompanyByToken(token: string): Promise<string | null> {
  if (!token || token.length < 16) return null
  const [row] = await db
    .select({ companyId: ropReportShares.companyId })
    .from(ropReportShares)
    .where(and(eq(ropReportShares.token, token), isNull(ropReportShares.revokedAt)))
    .limit(1)
  return row?.companyId ?? null
}
