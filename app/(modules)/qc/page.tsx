"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Headphones, Award, Crown, AlertTriangle,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react"
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts"
import { useRouter } from "next/navigation"
import {
  QC_CALLS, MANAGER_RATINGS, RESULT_MAP_QC, CHECKLIST_MAP,
  scoreColor, formatDurationQC, SENTIMENT_EMOJI_QC,
} from "@/lib/qc/demo-data"

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
function CountUp({ value }: { value: number }) { const d = useCountUp(value); return <>{d}</> }

// ─── Computed ─────────────────────────────────────────────────────────────────

const totalCalls = QC_CALLS.length
const avgScore = Math.round(QC_CALLS.reduce((s, c) => s + c.totalScore, 0) / totalCalls)
const bestManager = MANAGER_RATINGS[0]
const needAttention = QC_CALLS.filter((c) => c.totalScore < 50).length

const TREND_ICON: Record<string, { icon: typeof TrendingUp; cls: string }> = {
  up: { icon: TrendingUp, cls: "text-emerald-500" },
  stable: { icon: Minus, cls: "text-gray-400" },
  down: { icon: TrendingDown, cls: "text-red-500" },
}

const MEDALS = ["🥇", "🥈", "🥉"]

// Radar data — average across all calls
const radarData = [
  { skill: "Приветствие", value: Math.round(QC_CALLS.reduce((s, c) => s + (c.scores.greeting || 0), 0) / totalCalls), max: 10 },
  { skill: "Потребности", value: Math.round(QC_CALLS.reduce((s, c) => s + (c.scores.needs || 0), 0) / totalCalls), max: 20 },
  { skill: "Презентация", value: Math.round(QC_CALLS.reduce((s, c) => s + (c.scores.presentation || 0), 0) / totalCalls), max: 20 },
  { skill: "Возражения", value: Math.round(QC_CALLS.reduce((s, c) => s + (c.scores.objections || 0), 0) / totalCalls), max: 20 },
  { skill: "Закрытие", value: Math.round(QC_CALLS.reduce((s, c) => s + (c.scores.closing || 0), 0) / totalCalls), max: 15 },
].map((d) => ({ ...d, pct: Math.round((d.value / d.max) * 100) }))

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QCDashboardPage() {
  const router = useRouter()

  const summaryCards = [
    { label: "Проверено звонков", value: totalCalls, suffix: "", bg: "bg-blue-500", Icon: Headphones },
    { label: "Средний балл", value: avgScore, suffix: "/100", bg: "bg-purple-500", Icon: Award },
    { label: "Лучший менеджер", value: bestManager.avgScore, suffix: "", extra: `${bestManager.name.split(" ")[0]} И.`, bg: "bg-emerald-500", Icon: Crown },
    { label: "Требуют внимания", value: needAttention, suffix: "", bg: "bg-orange-500", Icon: AlertTriangle },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUpFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes cardStagger { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          .dash-card-enter { opacity: 0; animation: slideUpFadeIn 500ms ease-out forwards; }
          .ch-card-enter { opacity: 0; animation: cardStagger 350ms ease-out forwards; }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">ОКК — Контроль качества</h1>
              <p className="text-sm text-muted-foreground mt-1">AI-анализ звонков менеджеров</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {summaryCards.map((c, i) => (
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
                  <p className="text-3xl font-bold text-white tabular-nums">
                    {"extra" in c && c.extra ? <>{c.extra} — </> : null}
                    <CountUp value={c.value} />{c.suffix}
                  </p>
                </div>
              ))}
            </div>

            {/* Manager ratings + Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* Manager cards */}
              <div className="lg:col-span-2">
                <h3 className="text-base font-semibold mb-3">Рейтинг менеджеров</h3>
                <div className="grid grid-cols-2 gap-3">
                  {MANAGER_RATINGS.map((m, i) => {
                    const trend = TREND_ICON[m.trend]
                    const TrendIcon = trend.icon
                    const best = CHECKLIST_MAP[m.bestSkill]
                    const worst = CHECKLIST_MAP[m.worstSkill]
                    return (
                      <div
                        key={m.name}
                        className="ch-card-enter rounded-xl shadow-sm border border-border/60 bg-card p-4 hover:shadow-md transition-all duration-200"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="relative">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                                {m.name.split(" ").map((n) => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            {i < 3 && (
                              <span className="absolute -top-1 -right-1 text-sm">{MEDALS[i]}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm truncate">{m.name}</span>
                              <TrendIcon className={`w-4 h-4 ${trend.cls}`} />
                            </div>
                            <span className="text-xs text-muted-foreground">{m.calls} звонков</span>
                          </div>
                          <div
                            className="text-2xl font-bold tabular-nums"
                            style={{ color: scoreColor(m.avgScore) }}
                          >
                            {m.avgScore}
                          </div>
                        </div>
                        <div className="flex gap-2 text-[10px]">
                          <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded px-1.5 py-0.5">Лучше: {best?.label}</span>
                          <span className="bg-red-500/10 text-red-600 dark:text-red-400 rounded px-1.5 py-0.5">Слабее: {worst?.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Radar chart */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-5 bg-card" style={{ animationDelay: "600ms" }}>
                <h3 className="text-base font-semibold mb-2">Профиль отдела</h3>
                <p className="text-xs text-muted-foreground mb-3">Средний % по критериям</p>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis tick={false} domain={[0, 100]} axisLine={false} />
                      <Radar name="Отдел" dataKey="pct" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Call history table */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm bg-card hover:shadow-lg transition-shadow" style={{ animationDelay: "750ms" }}>
              <div className="p-5 pb-0"><h3 className="text-base font-semibold">Последние проверки</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Время", "Менеджер", "Клиент", "Длительность", "Балл", "Результат", "AI-вердикт"].map((h) => (
                        <th key={h} className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {QC_CALLS.map((call) => {
                      const res = RESULT_MAP_QC[call.result]
                      return (
                        <tr
                          key={call.id}
                          className="border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/qc/call/${call.id}`)}
                        >
                          <td className="px-5 py-3 text-sm text-muted-foreground whitespace-nowrap">{new Date(call.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-5 py-3 text-sm font-medium">{call.managerName}</td>
                          <td className="px-5 py-3 text-sm">{call.clientName}</td>
                          <td className="px-5 py-3 text-sm tabular-nums">{formatDurationQC(call.duration)}</td>
                          <td className="px-5 py-3">
                            <Badge className="text-xs font-bold text-white border-0" style={{ backgroundColor: scoreColor(call.totalScore) }}>
                              {call.totalScore}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant="secondary" className="text-[10px] border-0 font-medium" style={{ backgroundColor: `${res?.color}15`, color: res?.color }}>
                              {res?.label}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-xs text-muted-foreground max-w-[250px] truncate">{call.aiSummary.slice(0, 80)}...</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
