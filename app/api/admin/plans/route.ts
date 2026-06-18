import { NextRequest } from "next/server"
import { eq, count, isNull, isNotNull, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { plans, planModules, modules, companies } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/admin/plans — создать новый тариф
export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin()

    const body = await req.json().catch(() => ({}))
    const name: string     = body.name     ?? "Новый тариф"
    const price: number    = typeof body.price === "number" ? body.price : 0      // в копейках
    const interval: string = body.interval ?? "month"

    // Генерируем уникальный slug из имени
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[а-яё]/gi, c => {
        const map: Record<string, string> = {
          а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
          к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
          х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
        }
        return map[c.toLowerCase()] ?? c
      }) || "plan"

    const suffix = Math.random().toString(36).slice(2, 7)
    const slug = `${baseSlug}-${suffix}`

    const [newPlan] = await db
      .insert(plans)
      .values({ slug, name, price, interval, isPublic: false, sortOrder: 99 })
      .returning()

    return apiSuccess({ id: newPlan.id, slug: newPlan.slug, name: newPlan.name }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/plans POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// GET /api/admin/plans — все тарифы с модулями и кол-вом клиентов
// Query params:
//   ?archived=true — только архивные (archived_at IS NOT NULL, deleted_at IS NULL)
//   ?trashed=true  — только в корзине (deleted_at IS NOT NULL)
//   по умолчанию   — только активные (archived_at IS NULL, deleted_at IS NULL)
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin()

    const { searchParams } = req.nextUrl
    const archived = searchParams.get("archived") === "true"
    const trashed  = searchParams.get("trashed")  === "true"

    // Условие выборки по вкладке
    let whereClause
    if (trashed) {
      whereClause = isNotNull(plans.deletedAt)
    } else if (archived) {
      whereClause = and(isNotNull(plans.archivedAt), isNull(plans.deletedAt))
    } else {
      whereClause = and(isNull(plans.archivedAt), isNull(plans.deletedAt))
    }

    const rows = await db
      .select({ plan: plans, pm: planModules, module: modules })
      .from(plans)
      .leftJoin(planModules, eq(planModules.planId, plans.id))
      .leftJoin(modules, eq(modules.id, planModules.moduleId))
      .where(whereClause)
      .orderBy(plans.sortOrder, modules.sortOrder)

    // Кол-во клиентов на каждом тарифе
    const clientCounts = await db
      .select({ planId: companies.planId, cnt: count() })
      .from(companies)
      .where(isNull(companies.deletedAt))
      .groupBy(companies.planId)

    const countMap = new Map(clientCounts.map(r => [r.planId, r.cnt]))

    // Счётчики для табов
    const [{ archivedCount }] = await db
      .select({ archivedCount: count() })
      .from(plans)
      .where(and(isNotNull(plans.archivedAt), isNull(plans.deletedAt)))

    const [{ trashedCount }] = await db
      .select({ trashedCount: count() })
      .from(plans)
      .where(isNotNull(plans.deletedAt))

    const planMap = new Map<string, {
      id: string; slug: string; name: string; price: number
      currency: string | null; interval: string | null; isPublic: boolean | null
      sortOrder: number | null; clientCount: number
      archivedAt: Date | null; deletedAt: Date | null
      modules: { id: string; slug: string; name: string; icon: string | null }[]
    }>()

    for (const { plan, pm, module: mod } of rows) {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, {
          id: plan.id, slug: plan.slug, name: plan.name, price: plan.price,
          currency: plan.currency, interval: plan.interval, isPublic: plan.isPublic,
          sortOrder: plan.sortOrder,
          archivedAt: plan.archivedAt,
          deletedAt: plan.deletedAt,
          clientCount: countMap.get(plan.id) ?? 0,
          modules: [],
        })
      }
      if (mod && pm) {
        planMap.get(plan.id)!.modules.push({ id: mod.id, slug: mod.slug, name: mod.name, icon: mod.icon })
      }
    }

    return apiSuccess({
      data: [...planMap.values()],
      counts: {
        archived: Number(archivedCount),
        trashed: Number(trashedCount),
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/plans GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
