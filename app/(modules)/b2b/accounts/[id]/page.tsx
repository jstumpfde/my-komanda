"use client"

import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Building2, Clock, Lock } from "lucide-react"
import {
  B2B_ACCOUNTS, B2B_DEALS, INFLUENCE_MAP, ENGAGEMENT_MAP,
  TIER_BADGES, RISK_COLORS, formatValueShort,
} from "@/lib/b2b/demo-data"

const STAGE_LABELS: Record<string, string> = {
  new: "Новая", qualifying: "Квалификация", proposal: "Предложение", negotiation: "Переговоры",
}

export default function B2BAccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const account = B2B_ACCOUNTS.find((a) => a.id === id)

  if (!account) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Аккаунт не найден</p>
              <Button variant="outline" onClick={() => router.push("/b2b/accounts")}><ArrowLeft className="w-4 h-4 mr-2" />К аккаунтам</Button>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const tier = TIER_BADGES[account.tier]
  const accountDeals = B2B_DEALS.filter((d) => d.accountId === account.id)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <Button variant="ghost" size="icon" onClick={() => router.push("/b2b/accounts")}><ArrowLeft className="w-5 h-5" /></Button>
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{account.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{account.name}</h1>
                  {tier && <Badge variant="secondary" className={`text-xs border-0 ${tier.cls}`}>{tier.label}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{account.industry} · {account.size} · {account.revenue}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Left: Contact Map */}
              <div className="col-span-2 space-y-6">
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-base font-semibold mb-4">Карта ЛПР</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {account.contacts.map((c) => {
                      const inf = INFLUENCE_MAP[c.influence]
                      const eng = ENGAGEMENT_MAP[c.engagement]
                      const isDecisionMaker = c.influence === "decision_maker"
                      const isChampion = c.influence === "champion"
                      return (
                        <div
                          key={c.name}
                          className={`rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                            isChampion ? "border-emerald-500/50 bg-emerald-500/5" :
                            isDecisionMaker ? "border-red-500/30 bg-red-500/5" :
                            "border-border/60"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-9 h-9">
                                <AvatarFallback className="text-xs font-semibold bg-muted">{c.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-semibold">{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.role}</p>
                              </div>
                            </div>
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: eng?.color }} title={eng?.label} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] border-0 font-medium" style={{ backgroundColor: `${inf?.color}15`, color: inf?.color }}>
                              {inf?.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">Вовлечённость: {eng?.label}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Deals */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-base font-semibold mb-4">Сделки аккаунта</h3>
                  <div className="space-y-3">
                    {accountDeals.map((deal) => (
                      <div key={deal.id} className="flex items-center justify-between rounded-lg border border-border/50 p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{deal.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{STAGE_LABELS[deal.stage] || deal.stage}</span>
                            <span>·</span>
                            <span>{deal.probability}%</span>
                            <span>·</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{deal.daysInPipeline}д</span>
                            {deal.competitors.length > 0 && (
                              <>
                                <span>·</span>
                                <span>vs {deal.competitors.join(", ")}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold">{formatValueShort(deal.value)}</p>
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: RISK_COLORS[deal.riskLevel] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline stub */}
                <div className="rounded-xl border-2 border-dashed border-border/60 bg-muted/20 p-6 text-center">
                  <Lock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium mb-1">История взаимодействий</p>
                  <p className="text-xs text-muted-foreground">Таймлайн встреч, звонков и писем — Скоро</p>
                </div>
              </div>

              {/* Right: Info */}
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="text-sm font-semibold mb-3">Информация</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Отрасль</span><span>{account.industry}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Размер</span><span>{account.size}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Выручка</span><span className="font-medium">{account.revenue}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Статус</span><span className="capitalize">{account.status}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Сделок</span><span className="font-bold">{accountDeals.length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Общая сумма</span><span className="font-bold">{formatValueShort(account.totalValue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ср. цикл</span><span>{account.avgCycle} дней</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Контактов</span><span>{account.contacts.length}</span></div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="text-sm font-semibold mb-3">Ближайшие действия</h4>
                  <div className="space-y-2">
                    {accountDeals.map((d) => (
                      <div key={d.id} className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                        <p className="text-xs font-medium">{d.nextAction}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{d.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
