// Лимит AI-токенов/мес для модуля «База знаний» — платформенный дефолт +
// переопределение per-company. См. lib/knowledge/token-limits.ts.
//
// GET  — текущий эффективный лимит компании (override || платформенный дефолт),
//        остаток/использовано в этом месяце, и сам override (если задан) —
//        чтобы UI мог показать "используется дефолт" vs "своё значение".
// PATCH — задать/снять override компании. Только директор компании.

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany, requireDirector } from "@/lib/api-helpers"
import {
  getEffectiveAiMonthlyTokenLimit,
  getMonthTokensUsed,
  getPlatformAiMonthlyTokenLimit,
} from "@/lib/knowledge/token-limits"

export async function GET() {
  try {
    const user = await requireCompany()

    const [row] = await db
      .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const override = row?.hiringDefaultsJson?.aiMonthlyTokenLimit ?? null
    const [platformDefault, effectiveLimit, used] = await Promise.all([
      getPlatformAiMonthlyTokenLimit(),
      getEffectiveAiMonthlyTokenLimit(user.companyId),
      getMonthTokensUsed(user.companyId),
    ])

    return apiSuccess({ override, platformDefault, effectiveLimit, used })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/token-limit GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = (await req.json()) as { limit?: number | null }

    const [row] = await db
      .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    if (!row) return apiError("Company not found", 404)

    const current = row.hiringDefaultsJson ?? {}
    let nextLimit: number | null = null
    if (body.limit !== null && body.limit !== undefined) {
      const n = Math.floor(Number(body.limit))
      if (!Number.isFinite(n) || n <= 0) {
        return apiError("Лимит должен быть положительным числом токенов", 400)
      }
      nextLimit = n
    }

    await db
      .update(companies)
      .set({
        hiringDefaultsJson: { ...current, aiMonthlyTokenLimit: nextLimit },
        updatedAt: new Date(),
      })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ ok: true, override: nextLimit })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/token-limit PATCH]", err)
    return apiError("Internal server error", 500)
  }
}
