import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 36: per-company настройка строгости pre-filter к severe_abuse.
// GET — текущее значение.
// PUT body: { mode: "strict" | "lenient" }

const ALLOWED = ["strict", "lenient"] as const
type AbuseMode = typeof ALLOWED[number]

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({ mode: companies.aiAbuseMode })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    if (!row) return apiError("Company not found", 404)
    return apiSuccess({ mode: (row.mode ?? "strict") as AbuseMode })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = await req.json().catch(() => ({})) as { mode?: string }
    if (!body.mode || !(ALLOWED as readonly string[]).includes(body.mode)) {
      return apiError("Invalid mode (allowed: strict | lenient)", 400)
    }
    const [r] = await db.update(companies)
      .set({ aiAbuseMode: body.mode, updatedAt: new Date() })
      .where(eq(companies.id, user.companyId))
      .returning({ id: companies.id })
    if (!r) return apiError("Company not found", 404)
    return apiSuccess({ ok: true, mode: body.mode as AbuseMode })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
