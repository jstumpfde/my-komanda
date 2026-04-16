import { NextRequest } from "next/server"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { companyBankAccounts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function findOwnedAccount(id: string, companyId: string) {
  const [row] = await db
    .select()
    .from(companyBankAccounts)
    .where(and(eq(companyBankAccounts.id, id), eq(companyBankAccounts.companyId, companyId)))
    .limit(1)
  return row
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await context.params

    const existing = await findOwnedAccount(id, user.companyId)
    if (!existing) return apiError("Bank account not found", 404)

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
        .where(and(eq(companyBankAccounts.companyId, user.companyId), ne(companyBankAccounts.id, id)))
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (body.bank_name !== undefined) patch.bankName = body.bank_name
    if (body.bik !== undefined) patch.bik = body.bik
    if (body.rs !== undefined) patch.rs = body.rs
    if (body.ks !== undefined) patch.ks = body.ks
    if (body.is_default !== undefined) patch.isDefault = body.is_default
    if (body.sort_order !== undefined) patch.sortOrder = body.sort_order

    const [updated] = await db
      .update(companyBankAccounts)
      .set(patch)
      .where(eq(companyBankAccounts.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[bank-accounts PUT]", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await context.params

    const existing = await findOwnedAccount(id, user.companyId)
    if (!existing) return apiError("Bank account not found", 404)

    await db.delete(companyBankAccounts).where(eq(companyBankAccounts.id, id))

    if (existing.isDefault) {
      const [next] = await db
        .select()
        .from(companyBankAccounts)
        .where(eq(companyBankAccounts.companyId, user.companyId))
        .limit(1)
      if (next) {
        await db
          .update(companyBankAccounts)
          .set({ isDefault: true })
          .where(eq(companyBankAccounts.id, next.id))
      }
    }

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[bank-accounts DELETE]", err)
    return apiError("Internal server error", 500)
  }
}
