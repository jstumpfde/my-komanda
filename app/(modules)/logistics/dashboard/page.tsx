"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Truck, Inbox, Send, DollarSign, Percent,
  Sparkles,
} from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"

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
function CountUp({ value }: { value: number }) { return <>{useCountUp(value)}</> }

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CHART_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  shipments: [8, 10, 7, 12, 9, 5, 6, 11, 13, 8, 10, 14, 9, 7, 11, 15, 8, 12, 10, 6, 9, 13, 11, 8, 14, 10, 7, 12, 9, 11][i],
}))

const SHIPMENTS = [
  { id: "LOG-091", route: "Москва → Алматы", type: "🚛", client: "ТехноСтрой", status: "in_transit", date: "08.04", amount: "285K" },
  { id: "LOG-090", route: "Шанхай → Владивосток", type: "🚢", client: "СтройМаркет", status: "in_transit", date: "05.04", amount: "1.45M" },
  { id: "LOG-089", route: "Стамбул → Москва", type: "🚛", client: "МебельГрупп", status: "problem", date: "03.04", amount: "520K" },
  { id: "LOG-088", route: "Москва → Ташкент", type: "✈️", client: "ФармаЛогик", status: "delivered", date: "01.04", amount: "890K" },
  { id: "LOG-087", route: "Гуанчжоу → Новосибирск", type: "🚢", client: "ЭлектроТрейд", status: "in_transit", date: "28.03", amount: "2.1M" },
  { id: "LOG-086", route: "Минск → Москва", type: "🚛", client: "БелТекстиль", status: "delivered", date: "27.03", amount: "145K" },
  { id: "LOG-085", route: "Москва → Бишкек", type: "🚛", client: "КыргызПродукт", status: "offer", date: "26.03", amount: "380K" },
  { id: "LOG-084", route: "Дубай → Москва", type: "✈️", client: "ГолдИмпорт", status: "quote", date: "25.03", amount: "3.2M" },
  { id: "LOG-083", route: "Москва → Тбилиси", type: "🚛", client: "ВиноГрад", status: "delivered", date: "24.03", amount: "210K" },
  { id: "LOG-082", route: "Шэньчжэнь → Москва", type: "🚢", client: "ТехноИмпорт", status: "new", date: "23.03", amount: "1.8M" },
]

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  in_transit: { label: "В пути", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  delivered:  { label: "Доставлена", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  problem:    { label: "Проблема", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
  offer:      { label: "Оффер", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
  quote:      { label: "Расчёт", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  new:        { label: "Новая", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
}

const TRANSPORT_TYPES = [
  { emoji: "🚛", label: "Авто", count: 14, pct: 58, color: "#3B82F6" },
  { emoji: "🚢", label: "Море", count: 6, pct: 25, color: "#8B5CF6" },
  { emoji: "✈️", label: "Авиа", count: 3, pct: 13, color: "#F59E0B" },
  { emoji: "🚂", label: "Ж/Д", count: 1, pct: 4, color: "#10B981" },
]

const GEO_TOP = [
  { route: "РФ → КЗ", count: 8 },
  { route: "Китай → РФ", count: 6 },
  { route: "Турция → РФ", count: 4 },
  { route: "РФ → Узбекистан", count: 3 },
  { route: "ОАЭ → РФ", count: 3 },
]

const AI_RECS = [
  "🔥 Клиент «ТехноСтрой» запрашивал расчёт 3 дня назад — оффер не отправлен.",
  "📈 Ставки Шанхай→Владивосток снизились на 12% за неделю.",
  "⚠️ Перевозка #LOG-089 задерживается на 2 дня. Уведомите клиента.",
]

const maxGeo = GEO_TOP[0].count

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogisticsDashboardPage() {
  const metrics = [
    { label: "Активных перевозок", value: 24, sub: "+3 за неделю", bg: "bg-blue-500", Icon: Truck },
    { label: "Запросов на расчёт", value: 18, sub: "+7 сегодня", bg: "bg-emerald-500", Icon: Inbox },
    { label: "Офферов отправлено", value: 12, sub: "конверсия 67%", bg: "bg-purple-500", Icon: Send },
    { label: "Выручка за месяц", value: 42, sub: "+18% к пред. мес.", bg: "bg-orange-500", Icon: DollarSign, suffix: " млн ₽" },
    { label: "Средняя маржа", value: 48, sub: "цель: 5%", bg: "bg-violet-600", Icon: Percent, suffix: "", decimal: true },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUpFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          .dash-card-enter { opacity: 0; animation: slideUpFadeIn 500ms ease-out forwards; }
        ` }} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Логистика — Дашборд</h1>
              <p className="text-sm text-muted-foreground mt-1">Перевозки, расчёты и аналитика</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              {metrics.map((m, i) => (
                <div
                  key={m.label}
                  className={`dash-card-enter rounded-xl shadow-sm p-4 text-white ${m.bg} hover:shadow-md transition-all duration-300 cursor-default`}
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white/80">{m.label}</span>
                    <m.Icon className="w-4 h-4 text-white/70" />
                  </div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {m.decimal ? <>{(useCountUp(m.value) / 10).toFixed(1)}%</> : <><CountUp value={m.value} />{m.suffix || ""}</>}
                  </p>
                  <p className="text-[11px] text-white/70 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* AI Nancy */}
            <div className="dash-card-enter rounded-xl border bg-gradient-to-br from-[#EEEDFE] via-[#E6F1FB] to-[#F3E8FF] dark:from-[#1a1830] dark:via-[#172030] dark:to-[#1f1530] p-6 mb-6" style={{ animationDelay: "600ms" }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm">Ненси рекомендует</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {AI_RECS.map((rec, i) => (
                  <div key={i} className="rounded-lg bg-white/70 dark:bg-card/60 backdrop-blur p-3 border border-white/50 dark:border-border/50">
                    <p className="text-sm leading-snug">{rec}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card mb-6" style={{ animationDelay: "750ms" }}>
              <h3 className="text-base font-semibold mb-4">Перевозки за 30 дней</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={CHART_DATA} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="shipGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", fontSize: 12 }} />
                    <Area type="monotone" dataKey="shipments" name="Перевозок" stroke="#3B82F6" strokeWidth={2} fill="url(#shipGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Types + Geography */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Transport types */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card" style={{ animationDelay: "900ms" }}>
                <h3 className="text-base font-semibold mb-4">Перевозки по типам</h3>
                <div className="grid grid-cols-2 gap-3">
                  {TRANSPORT_TYPES.map((t) => (
                    <div key={t.label} className="rounded-lg border border-border/50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg">{t.emoji}</span>
                        <span className="text-xs text-muted-foreground">{t.pct}%</span>
                      </div>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-lg font-bold">{t.count}</p>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                        <div className="h-full rounded-full" style={{ width: `${t.pct}%`, backgroundColor: t.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Geography */}
              <div className="dash-card-enter rounded-xl border border-border shadow-sm p-6 bg-card" style={{ animationDelay: "1050ms" }}>
                <h3 className="text-base font-semibold mb-4">География топ-5</h3>
                <div className="space-y-3">
                  {GEO_TOP.map((g) => (
                    <div key={g.route}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{g.route}</span>
                        <span className="text-sm font-bold">{g.count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(g.count / maxGeo) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Shipments table */}
            <div className="dash-card-enter rounded-xl border border-border shadow-sm bg-card" style={{ animationDelay: "1200ms" }}>
              <div className="p-5 pb-0"><h3 className="text-base font-semibold">Последние перевозки</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["#", "Маршрут", "Тип", "Клиент", "Статус", "Дата", "Сумма"].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SHIPMENTS.map((s) => {
                      const st = STATUS_MAP[s.status]
                      return (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{s.id}</td>
                          <td className="px-4 py-3 text-sm font-medium">{s.route}</td>
                          <td className="px-4 py-3 text-center">{s.type}</td>
                          <td className="px-4 py-3 text-sm">{s.client}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={`text-[10px] border-0 font-medium ${st?.cls}`}>{st?.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{s.date}</td>
                          <td className="px-4 py-3 text-sm font-bold">₽{s.amount}</td>
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
