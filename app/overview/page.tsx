"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { getOnboarding, isOnboardingComplete, remainingSteps } from "@/lib/onboarding"
import Link from "next/link"
import {
  Users, UserCheck, Calendar, AlertTriangle, ArrowRight,
  Rocket, TrendingUp, Clock, Briefcase, CheckCircle2,
  MessageSquare, Zap, Play, ExternalLink,
} from "lucide-react"

const ACTIVITY_FEED = [
  { time: "14:23", icon: "🟢", text: "Иванов А. завершил демонстрацию (94%)", sub: "Менеджер продаж" },
  { time: "14:10", icon: "🔵", text: "Смирнова Е. выбрала слот: завтра 14:00", sub: "" },
  { time: "13:45", icon: "⚡", text: "Новый отклик с hh.ru — Козлов И.", sub: "IT менеджер" },
  { time: "13:20", icon: "✅", text: "Петров С. нанят", sub: "Руководитель отдела" },
  { time: "12:50", icon: "🔴", text: "Морозов Д. не пришёл на интервью", sub: "Менеджер продаж" },
  { time: "12:15", icon: "📨", text: "Бот отправил 3 сообщения (hh-чат)", sub: "" },
  { time: "11:40", icon: "🟢", text: "Белова А. начала демонстрацию", sub: "Аккаунт-менеджер" },
]

const TOP_VACANCIES = [
  { title: "Менеджер по продажам", stages: { new: 3, awaiting: 2, demo: 2, hrDecision: 2, interview: 1, final: 1, hired: 1 }, total: 12 },
  { title: "Руководитель отдела", stages: { new: 1, awaiting: 0, demo: 1, hrDecision: 1, interview: 1, final: 0, hired: 0 }, total: 4 },
  { title: "Аккаунт-менеджер", stages: { new: 1, awaiting: 1, demo: 0, hrDecision: 1, interview: 1, final: 0, hired: 0 }, total: 4 },
]

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return "Доброй ночи"
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

function formatDate(): string {
  return new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
}

export default function OverviewPage() {
  const [obRemaining, setObRemaining] = useState(0)
  const [obDone, setObDone] = useState(true)

  useEffect(() => {
    const ob = getOnboarding()
    setObDone(isOnboardingComplete(ob))
    setObRemaining(remainingSteps(ob))
  }, [])

  const kpi = [
    { label: "Новых откликов", value: 12, sub: "+3 за час", icon: Users, color: "text-blue-600 bg-blue-500/10" },
    { label: "Ожидают решения HR", value: 5, sub: "требуют внимания", icon: AlertTriangle, color: "text-red-600 bg-red-500/10", alert: true },
    { label: "Интервью сегодня", value: 2, sub: "14:00, 16:30", icon: Calendar, color: "text-purple-600 bg-purple-500/10" },
    { label: "Нанято за месяц", value: 3, sub: "+50% к пред. месяцу", icon: UserCheck, color: "text-emerald-600 bg-emerald-500/10" },
  ]

  const attentionItems = [
    { text: "5 кандидатов ждут решения", href: "/", cta: "Посмотреть" },
    { text: "2 интервью сегодня", href: "/interviews", cta: "Расписание" },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl">
            {/* Greeting */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">
                {getGreeting()}, Анна! ☀️
              </h1>
              <p className="text-muted-foreground text-sm capitalize">{formatDate()}</p>
            </div>

            {/* Onboarding banner */}
            {!obDone && obRemaining > 0 && (
              <div className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <Rocket className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Настройте платформу: осталось {obRemaining} {obRemaining === 1 ? "шаг" : obRemaining < 5 ? "шага" : "шагов"}</p>
                    <p className="text-xs text-muted-foreground">Завершите настройку для максимума от Моя Команда</p>
                  </div>
                </div>
                <Button size="sm" asChild><Link href="/register">Продолжить</Link></Button>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {kpi.map(k => (
                <Card key={k.label} className={cn(k.alert && "border-red-200 dark:border-red-800")}>
                  <CardContent className="p-4">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", k.color)}>
                      <k.icon className="w-4 h-4" />
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-foreground">{k.value}</span>
                      {k.alert && <Badge className="bg-red-500 text-white text-[10px] animate-pulse mb-1">!</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                    <p className="text-[10px] text-muted-foreground/70">{k.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column — attention + vacancies */}
              <div className="lg:col-span-2 space-y-6">
                {/* Attention block */}
                <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="w-4 h-4" /> Требуют внимания
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {attentionItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-card border">
                        <span className="text-sm text-foreground">{item.text}</span>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" asChild>
                          <Link href={item.href}>{item.cta} <ArrowRight className="w-3 h-3" /></Link>
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Top vacancies funnel */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="w-4 h-4" /> Сводная воронка — топ вакансии
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {TOP_VACANCIES.map(v => (
                      <div key={v.title} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{v.title}</span>
                          <Badge variant="secondary" className="text-xs">{v.total} чел</Badge>
                        </div>
                        <div className="flex gap-1 h-6">
                          {([
                            { count: v.stages.new, color: "#22d3ee", label: "Нов" },
                            { count: v.stages.awaiting, color: "#f59e0b", label: "Ожид" },
                            { count: v.stages.demo, color: "#3b82f6", label: "Демо" },
                            { count: v.stages.hrDecision, color: "#ef4444", label: "HR" },
                            { count: v.stages.interview, color: "#8b5cf6", label: "Инт" },
                            { count: v.stages.final, color: "#f97316", label: "Фин" },
                            { count: v.stages.hired, color: "#22c55e", label: "Нан" },
                          ]).map((s, i) => (
                            s.count > 0 ? (
                              <div
                                key={i}
                                className="rounded flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ backgroundColor: s.color, flex: s.count }}
                                title={`${s.label}: ${s.count}`}
                              >
                                {s.count}
                              </div>
                            ) : null
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Right column — activity feed */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Последняя активность
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {ACTIVITY_FEED.map((a, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                      <span className="text-base mt-0.5 shrink-0">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">{a.text}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{a.time}</span>
                          {a.sub && <span className="text-[10px] text-muted-foreground">· {a.sub}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
