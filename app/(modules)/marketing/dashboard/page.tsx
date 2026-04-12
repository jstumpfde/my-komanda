"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Eye, Users, DollarSign, Wallet,
  Search, Send, Globe, Mail, Gift,
  Sparkles, CheckCircle2, AlertTriangle, Info,
} from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts"
import { MARKETING_CHANNELS, LEADS_BY_DAY, CAMPAIGNS, AI_RECOMMENDATIONS, CHANNEL_MAP } from "@/lib/marketing/demo-data"

// ─── CountUp ──────────────────────────────────────────────────────────────────

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

function CountUp({ value }: { value: number }) {
  const d = useCountUp(value)
  return <>{d}</>
}

function CountUpK({ value }: { value: number }) {
  const d = useCountUp(value)
  if (d >= 1_000_000) return <>{(d / 1_000_000).toFixed(1).replace(/\.0$/, "")}M</>
  if (d >= 1_000) return <>{(d / 1_000).toFixed(d >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K</>
  return <>{d}</>
}

function CountUpRub({ value }: { value: number }) {
  const d = useCountUp(value)
  return <>{new Intl.NumberFormat("ru-RU").format(d)} ₽</>
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Search> = {
  Search, Users, Send, Globe, Mail, Gift,
}

const REC_ICONS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: "text-emerald-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500" },
  info: { icon: Info, color: "text-blue-500" },
}

// ─── Computed metrics ─────────────────────────────────────────────────────────

const totalImpressions = MARKETING_CHANNELS.reduce((s, c) => s + c.impressions, 0)
const totalLeads = MARKETING_CHANNELS.reduce((s, c) => s + c.leads, 0)
const totalSpent = MARKETING_CHANNELS.reduce((s, c) => s + c.spent, 0)
const totalBudget = MARKETING_CHANNELS.reduce((s, c) => s + c.budget, 0)
const avgCpa = Math.round(totalSpent / Math.max(totalLeads, 1))
const budgetPct = Math.round((totalSpent / totalBudget) * 100)

const CAMPAIGN_STATUSES: Record<string, { label: string; cls: string }> = {
  active:    { label: "Активна",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  completed: { label: "Завершена", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  paused:    { label: "Пауза",    cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
}

// Chart data: add "total" for tooltip
const chartData = LEADS_BY_DAY.map((d) => ({
  ...d,
  day: d.date.slice(8),
  total: d.yandex + d.vk + d.telegram + d.seo + d.email + d.referral,
}))

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUpFadeIn {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes cardStagger {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .dash-card-enter { opacity: 0; animation: slideUpFadeIn 500ms ease-out forwards; }
          .ch-card-enter { opacity: 0; animation: cardStagger 350ms ease-out forwards; }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Маркетинг — Дашборд</h1>
              <p className="text-sm text-muted-foreground mt-1">Метрики каналов, лиды и эффективность рекламы</p>
            </div>

            {/* ═══ Summary Cards ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Общий охват", value: totalImpressions, render: (v: number) => <CountUpK value={v} />, bg: "bg-blue-500", Icon: Eye },
                { label: "Лиды за месяц", value: totalLeads, render: (v: number) => <CountUp value={v} />, bg: "bg-purple-500", Icon: Users },
                { label: "Средний CPA", value: avgCpa, render: (v: number) => <CountUpRub value={v} />, bg: "bg-emerald-500", Icon: DollarSign },
                { label: `Бюджет ${budgetPct}%`, value: budgetPct, render: null, bg: "bg-orange-500", Icon: Wallet },
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
                  {c.render ? (
                    <p className="text-3xl font-bold text-white tabular-nums">{c.render(c.value)}</p>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold text-white tabular-nums mb-2"><CountUp value={c.value} />%</p>
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${budgetPct}%` }} />
                      </div>
                      <p className="text-xs text-white/70 mt-1">
                        {new Intl.NumberFormat("ru-RU").format(totalSpent)} ₽ / {new Intl.NumberFormat("ru-RU").format(totalBudget)} ₽
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ═══ Leads Chart ═══ */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card mb-6 hover:shadow-lg transition-shadow duration-200" style={{ animationDelay: "600ms" }}>
              <h3 className="text-base font-semibold mb-4">Лиды по дням — апрель 2026</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      {MARKETING_CHANNELS.map((ch) => (
                        <linearGradient key={ch.id} id={`grad-${ch.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ch.color} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={ch.color} stopOpacity={0.05} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    {MARKETING_CHANNELS.map((ch) => (
                      <Area
                        key={ch.id}
                        type="monotone"
                        dataKey={ch.id}
                        name={ch.name}
                        stroke={ch.color}
                        strokeWidth={1.5}
                        fill={`url(#grad-${ch.id})`}
                        stackId="1"
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ═══ Channel Cards ═══ */}
            <h3 className="text-base font-semibold mb-3">Каналы</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {MARKETING_CHANNELS.map((ch, i) => {
                const ChannelIcon = ICON_MAP[ch.icon] || Globe
                const pct = Math.round((ch.spent / ch.budget) * 100)
                return (
                  <div
                    key={ch.id}
                    className="ch-card-enter rounded-xl shadow-sm border border-border/60 bg-card p-5 hover:shadow-md transition-all duration-200 overflow-hidden"
                    style={{ borderLeft: `3px solid ${ch.color}`, animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${ch.color}20` }}>
                          <ChannelIcon className="w-4 h-4" style={{ color: ch.color }} />
                        </div>
                        <span className="font-semibold text-sm">{ch.name}</span>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] border-0">Активен</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div><p className="text-xs text-muted-foreground">Показы</p><p className="text-sm font-bold">{ch.impressions > 0 ? `${(ch.impressions / 1000).toFixed(1)}K` : "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Клики</p><p className="text-sm font-bold">{ch.clicks > 0 ? `${(ch.clicks / 1000).toFixed(1)}K` : "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">CTR</p><p className="text-sm font-bold">{ch.ctr > 0 ? `${ch.ctr}%` : "—"}</p></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div><p className="text-xs text-muted-foreground">Лиды</p><p className="text-sm font-bold">{ch.leads}</p></div>
                      <div><p className="text-xs text-muted-foreground">Конверсии</p><p className="text-sm font-bold">{ch.conversions}</p></div>
                      <div><p className="text-xs text-muted-foreground">CPA</p><p className="text-sm font-bold">{new Intl.NumberFormat("ru-RU").format(ch.cpa)} ₽</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Бюджет</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: ch.color }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ═══ Campaigns Table ═══ */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm bg-card mb-6 hover:shadow-lg transition-shadow duration-200" style={{ animationDelay: "900ms" }}>
              <div className="p-5 pb-0">
                <h3 className="text-base font-semibold">Кампании</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">Название</th>
                      <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-3 py-3">Канал</th>
                      <th className="text-center text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-3 py-3">Статус</th>
                      <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-3 py-3">Бюджет</th>
                      <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-3 py-3">Потрачено</th>
                      <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-3 py-3">Лиды</th>
                      <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">Период</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPAIGNS.map((c) => {
                      const ch = CHANNEL_MAP[c.channel]
                      const st = CAMPAIGN_STATUSES[c.status]
                      return (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium">{c.name}</td>
                          <td className="px-3 py-3">
                            <Badge variant="secondary" className="text-[10px] font-medium border-0" style={{ backgroundColor: `${ch?.color}15`, color: ch?.color }}>
                              {ch?.name || c.channel}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Badge variant="secondary" className={`text-[10px] font-medium border-0 ${st?.cls}`}>{st?.label}</Badge>
                          </td>
                          <td className="px-3 py-3 text-sm text-right text-muted-foreground">{new Intl.NumberFormat("ru-RU").format(c.budget)} ₽</td>
                          <td className="px-3 py-3 text-sm text-right font-medium">{new Intl.NumberFormat("ru-RU").format(c.spent)} ₽</td>
                          <td className="px-3 py-3 text-sm text-right font-bold">{c.leads}</td>
                          <td className="px-5 py-3 text-xs text-right text-muted-foreground whitespace-nowrap">
                            {new Date(c.startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — {new Date(c.endDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ═══ Nensi Recommends ═══ */}
            <div
              className="dash-card-enter rounded-xl border bg-gradient-to-br from-[#EEEDFE] via-[#E6F1FB] to-[#F3E8FF] dark:from-[#1a1830] dark:via-[#172030] dark:to-[#1f1530] p-6 hover:shadow-lg transition-shadow duration-200"
              style={{ animationDelay: "1050ms" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-white/70 dark:bg-white/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Ненси рекомендует</h3>
                  <p className="text-xs text-muted-foreground">AI-анализ ваших рекламных каналов</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AI_RECOMMENDATIONS.map((rec, i) => {
                  const r = REC_ICONS[rec.type] || REC_ICONS.info
                  const RecIcon = r.icon
                  return (
                    <div key={i} className="flex gap-3 rounded-lg bg-white/70 dark:bg-card/60 backdrop-blur p-3 border border-white/50 dark:border-border/50">
                      <RecIcon className={`w-5 h-5 ${r.color} shrink-0 mt-0.5`} />
                      <p className="text-sm leading-snug">{rec.text}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
