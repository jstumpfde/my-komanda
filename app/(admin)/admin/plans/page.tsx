import { eq, count } from "drizzle-orm"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { plans, planModules, modules, companies } from "@/lib/db/schema"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
          <div className="p-4 sm:p-6 max-w-5xl">
            <div className="flex items-center gap-2 mb-6">
              <LayoutGrid className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Тарифы</h1>
                <p className="text-muted-foreground text-sm">Управление тарифными планами и модулями</p>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Название</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Slug</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Цена</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Модули</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Клиентов</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Статус</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {planList.map(plan => (
                        <tr key={plan.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm text-foreground">{plan.name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {plan.slug}
                            </code>
                          </td>
                          <td className="text-right px-4 py-3">
                            <p className="text-sm font-semibold text-foreground">{formatPrice(plan.price)}</p>
                            <p className="text-xs text-muted-foreground">/{plan.interval === "month" ? "мес" : "год"}</p>
                          </td>
                          <td className="px-4 py-3">
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
                          </td>
                          <td className="text-right px-4 py-3">
                            <span className="text-sm font-medium text-foreground">{plan.clientCount}</span>
                          </td>
                          <td className="text-center px-4 py-3">
                            <Badge
                              variant="outline"
                              className={plan.isPublic
                                ? "text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800"
                                : "text-xs text-muted-foreground"
                              }
                            >
                              {plan.isPublic ? "Публичный" : "Скрытый"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button asChild size="sm" variant="ghost" className="h-8">
                              <Link href={`/admin/plans/${plan.id}`}>
                                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                Редактировать
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {planList.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                            Тарифы не найдены
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
