import { NextRequest } from "next/server"
import { and, eq, or, ilike, inArray, isNull, isNotNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { outreachCompanies } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireOutreachAccess } from "@/lib/outreach/access"

// POST — массовые действия над компаниями базы.
// Body: { action: 'trash'|'restore'|'delete', ids?: string[], allMatching?: bool, q?, inn?, region?, trashed?: bool }
//  - ids[]        — явно выбранные строки (с текущей страницы)
//  - allMatching  — «выбрать все N» по текущим фильтрам (q/inn/region), без перечисления ids
// trash:   active → корзина (deleted_at = now())
// restore: корзина → active (deleted_at = null)
// delete:  необратимо, ТОЛЬКО из корзины (контакты/ВЭД сносит FK cascade)
export async function POST(req: NextRequest) {
  try {
    const user = await requireOutreachAccess()
    const body = await req.json().catch(() => ({})) as {
      action?: string; ids?: unknown; allMatching?: boolean
      q?: string; inn?: string; region?: string
    }
    const action = body.action
    if (action !== "trash" && action !== "restore" && action !== "delete") {
      return apiError("Неизвестное действие", 400)
    }

    const base = eq(outreachCompanies.companyId, user.companyId)
    // С какой стороны действуем: trash берёт активные, restore/delete — из корзины.
    const sideFilter = action === "trash"
      ? isNull(outreachCompanies.deletedAt)
      : isNotNull(outreachCompanies.deletedAt)

    let selector: SQL | undefined
    if (body.allMatching) {
      const q = (body.q || "").trim()
      const innFilter = (body.inn || "").trim()
      const regionFilter = (body.region || "").trim()
      selector = and(
        q ? or(ilike(outreachCompanies.name, `%${q}%`), ilike(outreachCompanies.inn, `%${q}%`)) : undefined,
        innFilter ? ilike(outreachCompanies.inn, `%${innFilter}%`) : undefined,
        regionFilter ? ilike(outreachCompanies.region, `%${regionFilter}%`) : undefined,
      )
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : []
      if (!ids.length) return apiError("Не выбрано ни одной компании", 400)
      if (ids.length > 10000) return apiError("Слишком много за раз (макс. 10000)", 400)
      selector = inArray(outreachCompanies.id, ids)
    }

    const where = and(base, sideFilter, selector)

    let affected = 0
    if (action === "delete") {
      const res = await db.delete(outreachCompanies).where(where).returning({ id: outreachCompanies.id })
      affected = res.length
    } else {
      const res = await db
        .update(outreachCompanies)
        .set({ deletedAt: action === "trash" ? sql`now()` : sql`null`, updatedAt: sql`now()` })
        .where(where)
        .returning({ id: outreachCompanies.id })
      affected = res.length
    }

    return apiSuccess({ affected })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[email-marketing/companies/bulk]", err)
    return apiError("Ошибка массового действия", 500)
  }
}
