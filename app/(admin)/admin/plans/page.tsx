import { eq, count } from "drizzle-orm"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { plans, planModules, modules, companies } from "@/lib/db/schema"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { LayoutGrid, Pencil } from "lucide-react"
import Link from "next/link"

function formatPrice(kopecks: number) {
  return (kopecks / 100).toLocaleString("ru-RU") + " ₽"
}

export default async function AdminPlansPage() {
  const session = await auth()
  if (!session?.user || (session.user.role !== "platform_admin" && session.user.role !== "admin")) {
    redirect("/login")
  }

  // Планы с модулями
  const rows = await db
    .select({ plan: plans, pm: planModules, module: modules })
    .from(plans)
    .leftJoin(planModules, eq(planModules.planId, plans.id))
    .leftJoin(modules, eq(modules.id, planModules.moduleId))
    .orderBy(plans.sortOrder, modules.sortOrder)

  // Кол-во клиентов
  const clientCounts = await db
    .select({ planId: companies.planId, cnt: count() })
    .from(companies)
    .groupBy(companies.planId)
  const countMap = new Map(clientCounts.map(r => [r.planId, r.cnt]))

  type PlanRow = {
    id: string; slug: string; name: string; price: number
    isPublic: boolean | null; interval: string | null; sortOrder: number | null
    clientCount: number
    modules: { id: string; slug: string; name: string }[]
  }
  const planMap = new Map<string, PlanRow>()
  for (const { plan, pm, module: mod } of rows) {
    if (!planMap.has(plan.id)) {
      planMap.set(plan.id, {
        id: plan.id, slug: plan.slug, name: plan.name, price: plan.price,
        isPublic: plan.isPublic, interval: plan.interval, sortOrder: plan.sortOrder,
        clientCount: countMap.get(plan.id) ?? 0,
        modules: [],
      })
    }
    if (mod && pm) planMap.get(plan.id)!.modules.push({ id: mod.id, slug: mod.slug, name: mod.name })
  }
  const planList = [...planMap.values()]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 mb-6">
              <LayoutGrid className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Тарифы</h1>
                <p className="text-muted-foreground text-sm">Управление тарифными планами и модулями</p>
              </div>
            </div>

            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Название</DataHeadCell>
                  <DataHeadCell>Slug</DataHeadCell>
                  <DataHeadCell align="right">Цена</DataHeadCell>
                  <DataHeadCell>Модули</DataHeadCell>
                  <DataHeadCell align="right">Клиентов</DataHeadCell>
                  <DataHeadCell align="center">Статус</DataHeadCell>
                  <DataHeadCell align="right" />
                </DataHead>
                <tbody>
                  {planList.map(plan => (
                    <DataRow key={plan.id}>
                      <DataCell>
                        <p className="font-medium text-foreground">{plan.name}</p>
                      </DataCell>
                      <DataCell>
                        <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {plan.slug}
                        </code>
                      </DataCell>
                      <DataCell align="right">
                        <p className="font-semibold text-foreground">{formatPrice(plan.price)}</p>
                        <p className="text-xs text-muted-foreground">/{plan.interval === "month" ? "мес" : "год"}</p>
                      </DataCell>
                      <DataCell>
                        <div className="flex flex-wrap gap-1">
                          {plan.modules.length === 0
                            ? <span className="text-xs text-muted-foreground">—</span>
                            : plan.modules.map(m => (
                              <Badge key={m.id} variant="secondary" className="text-xs">
                                {m.name}
                              </Badge>
                            ))
                          }
                        </div>
                      </DataCell>
                      <DataCell align="right">
                        <span className="font-medium text-foreground">{plan.clientCount}</span>
                      </DataCell>
                      <DataCell align="center">
                        <Badge
                          variant="outline"
                          className={plan.isPublic
                            ? "text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800"
                            : "text-xs text-muted-foreground"
                          }
                        >
                          {plan.isPublic ? "Публичный" : "Скрытый"}
                        </Badge>
                      </DataCell>
                      <DataCell align="right">
                        <Button asChild size="sm" variant="ghost" className="h-8">
                          <Link href={`/admin/plans/${plan.id}`}>
                            <Pencil className="w-3.5 h-3.5 mr-1.5" />
                            Редактировать
                          </Link>
                        </Button>
                      </DataCell>
                    </DataRow>
                  ))}
                  {planList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                        Тарифы не найдены
                      </td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
