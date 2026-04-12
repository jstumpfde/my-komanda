"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Phone, PhoneCall, CheckCircle, TrendingUp,
  Bell, ClipboardList, RefreshCw, PhoneOutgoing,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts"
import {
  CALL_SCRIPTS, SCRIPT_TYPE_MAP, CALL_HISTORY, RESULT_MAP,
  CALLS_BY_HOUR, CONVERSION_BY_DAY, SCRIPT_STATUSES,
  formatDuration, SENTIMENT_EMOJI,
} from "@/lib/dialer/demo-data"

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

// ─── Live Dialing Timer ───────────────────────────────────────────────────────

function LiveDialer() {
  const [sec, setSec] = useState(23)
  useEffect(() => {
    const iv = setInterval(() => setSec((s) => s + 1), 1000)
    return () => clearInterval(iv)
  }, [])
  const m = Math.floor(sec / 60)
  const s = sec % 60

  return (
    <div className="dash-card-enter rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 mb-6" style={{ animationDelay: "600ms" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">Активный обзвон</span>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-0">В процессе</Badge>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div>
          <p className="text-xs text-muted-foreground">Текущий звонок</p>
          <p className="text-sm font-medium mt-0.5">Петрова Мария +7 (916) ***-**-78</p>
          <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{m}:{String(s).padStart(2, "0")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">В очереди</p>
          <p className="text-2xl font-bold mt-0.5">12</p>
          <p className="text-xs text-muted-foreground">контактов</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Скорость</p>
          <p className="text-2xl font-bold mt-0.5">~3</p>
          <p className="text-xs text-muted-foreground">звонка/мин</p>
        </div>
      </div>
    </div>
  )
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof Bell> = { Bell, ClipboardList, RefreshCw, PhoneOutgoing }

// ─── Computed summary ─────────────────────────────────────────────────────────

const todayCalls = 67
const todayAnswered = 51
const todaySuccess = 42
const dозвон = Math.round((todayAnswered / todayCalls) * 100)
const conversion = Math.round((todaySuccess / todayCalls) * 100)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DialerDashboardPage() {
  const summaryCards = [
    { label: "Звонков сегодня", value: todayCalls, suffix: "", bg: "bg-blue-500", Icon: Phone },
    { label: "Дозвон", value: dозвон, suffix: "%", bg: "bg-purple-500", Icon: PhoneCall },
    { label: "Успешных", value: todaySuccess, suffix: "", bg: "bg-emerald-500", Icon: CheckCircle },
    { label: "Конверсия", value: conversion, suffix: "%", bg: "bg-orange-500", Icon: TrendingUp },
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
              <h1 className="text-2xl font-bold tracking-tight">Бот-звонарь</h1>
              <p className="text-sm text-muted-foreground mt-1">AI-агент для исходящих звонков по скриптам</p>
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
                    <CountUp value={c.value} />{c.suffix}
                  </p>
                </div>
              ))}
            </div>

            {/* Live Dialer */}
            <LiveDialer />

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Calls by hour */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card hover:shadow-lg transition-shadow" style={{ animationDelay: "750ms" }}>
                <h3 className="text-base font-semibold mb-4">Звонки по часам</h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...CALLS_BY_HOUR]} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="calls" name="Все звонки" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="answered" name="Дозвонились" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Conversion by day */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card hover:shadow-lg transition-shadow" style={{ animationDelay: "900ms" }}>
                <h3 className="text-base font-semibold mb-4">Конверсия по дням</h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[...CONVERSION_BY_DAY]} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} unit="%" domain={[40, 80]} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", fontSize: 12 }} />
                      <Area type="monotone" dataKey="pct" name="Конверсия %" stroke="#8B5CF6" strokeWidth={2} fill="url(#convGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Scripts */}
            <h3 className="text-base font-semibold mb-3">Скрипты обзвона</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {CALL_SCRIPTS.map((script, i) => {
                const tp = SCRIPT_TYPE_MAP[script.type]
                const st = SCRIPT_STATUSES[script.status]
                const ScriptIcon = TYPE_ICONS[tp?.icon || "Bell"] || Bell
                const answerPct = Math.round((script.answered / script.calls) * 100)
                const successPct = Math.round((script.success / script.calls) * 100)
                return (
                  <div
                    key={script.id}
                    className="ch-card-enter rounded-xl shadow-sm border border-border/60 bg-card p-5 hover:shadow-md transition-all duration-200"
                    style={{ borderLeft: `3px solid ${tp?.color || "#666"}`, animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${tp?.color}20` }}>
                          <ScriptIcon className="w-4 h-4" style={{ color: tp?.color }} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{script.name}</h4>
                          <span className="text-[10px] text-muted-foreground">{tp?.label}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] border-0 ${st?.cls}`}>{st?.label}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div><p className="text-xs text-muted-foreground">Звонков</p><p className="text-sm font-bold">{script.calls}</p></div>
                      <div><p className="text-xs text-muted-foreground">Дозвон</p><p className="text-sm font-bold">{answerPct}%</p></div>
                      <div><p className="text-xs text-muted-foreground">Успех</p><p className="text-sm font-bold">{successPct}%</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Успешных</span>
                        <span>{script.success}/{script.calls}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${successPct}%`, backgroundColor: tp?.color }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Call History */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm bg-card hover:shadow-lg transition-shadow" style={{ animationDelay: "1050ms" }}>
              <div className="p-5 pb-0"><h3 className="text-base font-semibold">Последние звонки</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Время", "Скрипт", "Клиент", "Телефон", "Длительность", "Результат", ""].map((h) => (
                        <th key={h} className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CALL_HISTORY.map((call) => {
                      const res = RESULT_MAP[call.result]
                      return (
                        <tr key={call.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3 text-sm text-muted-foreground whitespace-nowrap">{new Date(call.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-5 py-3 text-sm">{call.scriptName}</td>
                          <td className="px-5 py-3 text-sm font-medium">{call.clientName}</td>
                          <td className="px-5 py-3 text-sm text-muted-foreground">{call.phone}</td>
                          <td className="px-5 py-3 text-sm tabular-nums">{formatDuration(call.duration)}</td>
                          <td className="px-5 py-3">
                            <Badge variant="secondary" className="text-[10px] border-0 font-medium" style={{ backgroundColor: `${res?.color}15`, color: res?.color }}>
                              {res?.label}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-center">{call.sentiment ? SENTIMENT_EMOJI[call.sentiment] : ""}</td>
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
