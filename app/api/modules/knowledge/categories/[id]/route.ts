import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeCategories } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [category] = await db
      .select()
      .from(knowledgeCategories)
      .where(and(eq(knowledgeCategories.id, id), eq(knowledgeCategories.tenantId, user.companyId)))

    if (!category) return apiError("Not found", 404)
    return apiSuccess(category)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as Partial<{
      name: string
      description: string
      icon: string
      sortOrder: number
      parentId: string
      status: string
    }>

    const [updated] = await db
      .update(knowledgeCategories)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(knowledgeCategories.id, id), eq(knowledgeCategories.tenantId, user.companyId)))
      .returning()

    if (!updated) return apiError("Not found", 404)
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .update(knowledgeCategories)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(knowledgeCategories.id, id), eq(knowledgeCategories.tenantId, user.companyId)))
      .returning()

    if (!deleted) return apiError("Not found", 404)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
