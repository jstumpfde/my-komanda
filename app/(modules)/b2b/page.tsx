"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Briefcase, Clock, Target, Building2, Calendar, Phone, FileText, Mail } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts"
import { B2B_DEALS, B2B_FUNNEL, WEEKLY_ACTIVITIES, formatValueShort } from "@/lib/b2b/demo-data"

// CountUp
function useCountUp(target: number | null, dur = 1000) {
  const [d, setD] = useState(0)
  useEffect(() => {
    if (target == null) return
    const s = d, delta = target - s
    if (!delta) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      setD(Math.round(s + delta * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, dur])
  return d
}
function CountUp({ value }: { value: number }) { return <>{useCountUp(value)}</> }
function CountUpMln({ value }: { value: number }) {
  const d = useCountUp(value)
  return <>{(d / 1_000_000).toFixed(1).replace(/\.0$/, "")} млн ₽</>
}

const totalPipeline = B2B_DEALS.reduce((s, d) => s + d.value, 0)
const avgCycle = Math.round(B2B_DEALS.reduce((s, d) => s + d.daysInPipeline, 0) / B2B_DEALS.length)
const winRate = 62

const nextActions = B2B_DEALS
  .map((d) => ({ action: d.nextAction, account: d.accountName, deal: d.title, date: d.expectedClose }))
  .sort((a, b) => a.date.localeCompare(b.date))
  .slice(0, 6)

const ACTION_ICONS: Record<string, typeof Calendar> = {
  "Презентация": Calendar, "Discovery": Phone, "Согласование": FileText,
  "Пилотный": Calendar, "Демо": Calendar, "Подготовка": FileText, "Финальное": FileText, "Расчёт": FileText,
}

function getActionIcon(action: string) {
  for (const [key, Icon] of Object.entries(ACTION_ICONS)) {
    if (action.includes(key)) return Icon
  }
  return Mail
}

export default function B2BDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUpFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes funnelExpand { from { opacity: 0; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }
          .dash-card-enter { opacity: 0; animation: slideUpFadeIn 500ms ease-out forwards; }
          .funnel-bar { opacity: 0; transform-origin: left; animation: funnelExpand 600ms ease-out forwards; }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">B2B Продажи</h1>
              <p className="text-sm text-muted-foreground mt-1">Длинные сделки, аккаунты и тендеры</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Pipeline", value: totalPipeline, render: () => <CountUpMln value={totalPipeline} />, bg: "bg-blue-500", Icon: Briefcase },
                { label: "Средний цикл", value: avgCycle, render: () => <><CountUp value={avgCycle} /> дней</>, bg: "bg-purple-500", Icon: Clock },
                { label: "Win Rate", value: winRate, render: () => <><CountUp value={winRate} />%</>, bg: "bg-emerald-500", Icon: Target },
                { label: "Аккаунтов", value: 5, render: () => <CountUp value={5} />, bg: "bg-orange-500", Icon: Building2 },
              ].map((c, i) => (
                <div
                  key={c.label}
                  className={`dash-card-enter rounded-xl shadow-sm p-5 text-white ${c.bg} hover:scale-[1.02] hover:shadow-lg transition-all duration-300 cursor-default`}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-white/90">{c.label}</span>
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <c.Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-white tabular-nums">{c.render()}</p>
                </div>
              ))}
            </div>

            {/* Funnel */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card mb-6" style={{ animationDelay: "600ms" }}>
              <h3 className="text-base font-semibold mb-4">Воронка B2B</h3>
              <div className="space-y-3">
                {B2B_FUNNEL.map((step, i) => {
                  const maxValue = Math.max(...B2B_FUNNEL.map((s) => s.value))
                  const widthPct = Math.max(25, Math.round((step.value / maxValue) * 100))
                  return (
                    <div key={step.stage} className="flex items-center gap-4">
                      <span className="text-sm font-medium w-28 shrink-0">{step.stage}</span>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div
                          className="funnel-bar h-10 rounded-lg flex items-center px-4 justify-between max-w-full"
                          style={{ width: `${widthPct}%`, backgroundColor: step.color, animationDelay: `${700 + i * 150}ms` }}
                        >
                          <span className="text-white text-sm font-semibold whitespace-nowrap">{step.count} сделок</span>
                          <span className="text-white/80 text-sm whitespace-nowrap">{formatValueShort(step.value)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Activity chart */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card" style={{ animationDelay: "900ms" }}>
                <h3 className="text-base font-semibold mb-4">Активность за неделю</h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...WEEKLY_ACTIVITIES]} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="meetings" name="Встречи" fill="#8B5CF6" radius={[4, 4, 0, 0]} stackId="a" />
                      <Bar dataKey="calls" name="Звонки" fill="#3B82F6" radius={[0, 0, 0, 0]} stackId="a" />
                      <Bar dataKey="emails" name="Письма" fill="#10B981" radius={[0, 0, 0, 0]} stackId="a" />
                      <Bar dataKey="proposals" name="КП" fill="#F59E0B" radius={[0, 0, 4, 4]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Next actions */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card" style={{ animationDelay: "1050ms" }}>
                <h3 className="text-base font-semibold mb-4">Ближайшие действия</h3>
                <div className="space-y-3">
                  {nextActions.map((a, i) => {
                    const ActionIcon = getActionIcon(a.action)
                    return (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <ActionIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{a.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{a.account} · {a.deal}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
