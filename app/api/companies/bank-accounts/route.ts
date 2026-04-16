import { NextRequest } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyBankAccounts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select()
      .from(companyBankAccounts)
      .where(eq(companyBankAccounts.companyId, user.companyId))
      .orderBy(asc(companyBankAccounts.sortOrder), asc(companyBankAccounts.createdAt))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[bank-accounts GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()

    const body = await req.json() as {
      bank_name?: string
      bik?: string
      rs?: string
      ks?: string
      is_default?: boolean
      sort_order?: number
    }

    if (body.is_default) {
      await db
        .update(companyBankAccounts)
        .set({ isDefault: false })
        .where(eq(companyBankAccounts.companyId, user.companyId))
    }

    const [created] = await db
      .insert(companyBankAccounts)
      .values({
        companyId: user.companyId,
        bankName: body.bank_name ?? null,
        bik: body.bik ?? null,
        rs: body.rs ?? null,
        ks: body.ks ?? null,
        isDefault: body.is_default ?? false,
        sortOrder: body.sort_order ?? 0,
      })
      .returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[bank-accounts POST]", err)
    return apiError("Internal server error", 500)
  }
}
