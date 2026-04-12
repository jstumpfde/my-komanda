"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Building2, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { B2B_ACCOUNTS, INFLUENCE_MAP, ENGAGEMENT_MAP, TIER_BADGES, formatValueShort } from "@/lib/b2b/demo-data"

export default function B2BAccountsPage() {
  const router = useRouter()

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes cardStagger { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          .ch-card-enter { opacity: 0; animation: cardStagger 350ms ease-out forwards; }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Аккаунты</h1>
              <p className="text-sm text-muted-foreground mt-1">Ключевые B2B-клиенты и карты контактов</p>
            </div>

            <div className="space-y-4">
              {B2B_ACCOUNTS.map((acc, i) => {
                const tier = TIER_BADGES[acc.tier]
                const daysSince = Math.round((Date.now() - new Date(acc.lastActivity).getTime()) / 86400000)
                return (
                  <div
                    key={acc.id}
                    className="ch-card-enter rounded-xl shadow-sm border border-border/60 bg-card p-6 hover:shadow-md transition-all duration-200"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                            {acc.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{acc.name}</h3>
                            {tier && <Badge variant="secondary" className={`text-[10px] border-0 ${tier.cls}`}>{tier.label}</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{acc.industry} · {acc.size} сотрудников · {acc.revenue}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => router.push(`/b2b/accounts/${acc.id}`)}>
                        Подробнее <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Сделок</p>
                        <p className="text-lg font-bold">{acc.deals}</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Сумма</p>
                        <p className="text-lg font-bold">{formatValueShort(acc.totalValue)}</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Ср. цикл</p>
                        <p className="text-lg font-bold">{acc.avgCycle} дн</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Активность</p>
                        <p className="text-lg font-bold">{daysSince}д назад</p>
                      </div>
                    </div>

                    {/* Contacts compact */}
                    <div className="flex flex-wrap gap-2">
                      {acc.contacts.map((c) => {
                        const inf = INFLUENCE_MAP[c.influence]
                        const eng = ENGAGEMENT_MAP[c.engagement]
                        return (
                          <div key={c.name} className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: eng?.color }} />
                            <span className="text-xs font-medium">{c.name.split(" ")[0]}</span>
                            <Badge variant="secondary" className="text-[9px] border-0 h-4 px-1" style={{ backgroundColor: `${inf?.color}15`, color: inf?.color }}>
                              {inf?.label}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
