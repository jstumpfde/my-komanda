/**
 * /ai-rop/objections — «Библиотека возражений»: сырые формулировки возражений
 * с частотой за период; если посчитана AI-кластеризация (lib/ai-rop/objection-
 * clusters.ts) — группировка по фиксированной таксономии категорий, иначе —
 * плоский топ-30 формулировок с CTA «Посчитать категории».
 *
 * Доступ — ropCanViewTeam. Период — GET searchParams (?period=7|30|all),
 * без клиентского fetch при смене периода (см. _ui.tsx::PeriodTabs).
 */
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { MessageSquareWarning } from "lucide-react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { getClusterMap, getTaxonomy } from "@/lib/ai-rop/objection-clusters"
import { PeriodTabs, ReclusterButton, CategoryList, RawObjectionsTable, type PeriodKey, type ObjectionCategory } from "./_ui"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

const CATCH_ALL_CATEGORIES = new Set(["Прочее", "Без категории"])

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function periodLabel(period: PeriodKey): string {
  if (period === "7") return "за 7 дней"
  if (period === "30") return "за 30 дней"
  return "за всё время"
}

export default async function ObjectionsPage(props: { searchParams: Promise<{ period?: string }> }) {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  if (!ropCanViewTeam(user)) redirect("/ai-rop")
  const companyId = user.companyId

  const sp = await props.searchParams
  const period: PeriodKey = sp.period === "7" || sp.period === "all" ? sp.period : "30"
  const fromIso = period === "all" ? null : isoDaysAgo(period === "7" ? 7 : 30)

  // ── Сырые возражения за период (см. образец lib/ai-rop/dashboard-data.ts::topObjections,
  // но там без периода — здесь период обязателен, поэтому свой SQL прямо тут). ──
  const dateFilter = fromIso ? sql`AND substr(c.started_at::text,1,10) >= ${fromIso}` : sql``
  const rows = (await db.execute(sql`
    SELECT a.objections_json AS objections_json
    FROM rop_analyses a JOIN rop_calls c ON c.id = a.call_id
    WHERE c.tenant_id = ${companyId}::uuid
      AND a.objections_json IS NOT NULL AND jsonb_array_length(a.objections_json) > 0
      ${dateFilter}
    LIMIT 5000
  `)) as unknown as Array<{ objections_json: unknown }>

  const freq = new Map<string, number>()
  for (const r of rows) {
    const arr = Array.isArray(r.objections_json) ? (r.objections_json as unknown[]) : []
    for (const o of arr) {
      const k = String(o ?? "").trim().toLowerCase()
      if (!k || k.length < 3) continue
      freq.set(k, (freq.get(k) || 0) + 1)
    }
  }
  const totalObjections = [...freq.values()].reduce((a, b) => a + b, 0)

  const [cluster, taxonomy] = await Promise.all([getClusterMap(companyId), getTaxonomy(companyId)])
  const clustered = !!cluster && Object.keys(cluster.map).length > 0

  let categories: ObjectionCategory[] = []
  let rawTop: { text: string; count: number }[] = []

  if (clustered) {
    // Ключи cluster.map — оригинальный регистр фразы на момент подсчёта в
    // computeClusterMap (без toLowerCase), а наш freq — уже toLowerCase.
    // Сопоставляем case-insensitive; не нашли — «Без категории».
    const normMap = new Map<string, string>()
    for (const [phrase, cat] of Object.entries(cluster!.map)) {
      normMap.set(phrase.toLowerCase(), cat)
    }
    const byCat = new Map<string, { count: number; phrases: Map<string, number> }>()
    for (const [phrase, count] of freq.entries()) {
      const cat = normMap.get(phrase) || "Без категории"
      const entry = byCat.get(cat) ?? { count: 0, phrases: new Map<string, number>() }
      entry.count += count
      entry.phrases.set(phrase, count)
      byCat.set(cat, entry)
    }
    // Фиксированный порядок таксономии (привычные позиции категорий между
    // пересчётами); служебные «Прочее»/«Без категории» — всегда в конце.
    const order = new Map(taxonomy.map((c, i) => [c.name, i]))
    categories = [...byCat.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        phrases: [...v.phrases.entries()]
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => {
        const aCatch = CATCH_ALL_CATEGORIES.has(a.name)
        const bCatch = CATCH_ALL_CATEGORIES.has(b.name)
        if (aCatch !== bCatch) return aCatch ? 1 : -1
        const ao = order.get(a.name)
        const bo = order.get(b.name)
        if (ao != null && bo != null) return ao - bo
        return b.count - a.count
      })
  } else {
    rawTop = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([text, count]) => ({ text, count }))
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <TrialBanner />
            <div className="flex items-center justify-between gap-3 flex-wrap pt-3 pb-2">
              <div className="flex items-center gap-2">
                <MessageSquareWarning className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Библиотека возражений</h1>
              </div>
              <ReclusterButton hasClusters={clustered} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pb-4">
              <PeriodTabs period={period} />
              <span className="text-sm text-muted-foreground">
                {totalObjections} возражений {periodLabel(period)}
              </span>
            </div>

            {totalObjections === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Возражений не найдено за выбранный период.
                </CardContent>
              </Card>
            ) : clustered ? (
              <CategoryList categories={categories} />
            ) : (
              <RawObjectionsTable rows={rawTop} />
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
