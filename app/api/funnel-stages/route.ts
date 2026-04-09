import { NextRequest } from "next/server"
import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { funnelStages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const DEFAULT_STAGES = [
  { title: "Новый",              slug: "new",          sortOrder: 0, color: "#3B82F6", isTerminal: false, isDefault: true },
  { title: "Демонстрация",      slug: "demo",         sortOrder: 1, color: "#8B5CF6", isTerminal: false, isDefault: false },
  { title: "Интервью назначено", slug: "scheduled",    sortOrder: 2, color: "#EAB308", isTerminal: false, isDefault: false },
  { title: "Интервью пройдено",  slug: "interviewed",  sortOrder: 3, color: "#F97316", isTerminal: false, isDefault: false },
  { title: "Нанят",             slug: "hired",         sortOrder: 4, color: "#22C55E", isTerminal: true,  isDefault: false },
  { title: "Отказ",             slug: "rejected",      sortOrder: 5, color: "#EF4444", isTerminal: true,  isDefault: false },
]

export async function GET() {
  try {
    const user = await requireCompany()

    let stages = await db
      .select()
      .from(funnelStages)
      .where(eq(funnelStages.companyId, user.companyId))
      .orderBy(asc(funnelStages.sortOrder))

    // Seed defaults if empty
    if (stages.length === 0) {
      const values = DEFAULT_STAGES.map(s => ({
        ...s,
        companyId: user.companyId,
      }))

      stages = await db
        .insert(funnelStages)
        .values(values)
        .returning()
    }

    return apiSuccess(stages)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[funnel-stages GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()

    const body = await req.json() as Array<{
      id: string
      title: string
      slug: string
      sort_order: number
      color: string
    }>

    if (!Array.isArray(body)) {
      return apiError("Expected array", 400)
    }

    const results = []
    for (const item of body) {
      const [updated] = await db
        .update(funnelStages)
        .set({
          title: item.title,
          slug: item.slug,
          sortOrder: item.sort_order,
          color: item.color,
        })
        .where(eq(funnelStages.id, item.id))
        .returning()

      if (updated) results.push(updated)
    }

    return apiSuccess(results)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[funnel-stages PUT]", err)
    return apiError("Internal server error", 500)
  }
}
