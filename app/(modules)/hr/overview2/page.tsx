"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Briefcase, MessageSquareText, Clock,
  Sparkles, Bot, ArrowRight,
} from "lucide-react"

// ─── Метрики ────────────────────────────────────────────────────────────────

const METRICS = [
  { label: "Активных вакансий", value: "8", icon: Briefcase, badge: undefined as string | undefined, badgeColor: "" },
  { label: "Новых откликов сегодня", value: "23", icon: MessageSquareText, badge: "+12%", badgeColor: "text-emerald-700 bg-emerald-500/10" },
  { label: "Ср. время закрытия", value: "18 дн", icon: Clock, badge: "−3", badgeColor: "text-emerald-700 bg-emerald-500/10" },
]

// ─── AI-рекомендации ────────────────────────────────────────────────────────

const AI_RECOMMENDATIONS = [
  {
    text: "Вакансия Менеджер по продажам — 3 кандидата с AI-скором >85. Рекомендую пригласить на интервью",
    actions: [
      { label: "Пригласить всех", variant: "default" as const },
      { label: "Посмотреть", variant: "outline" as const },
    ],
  },
  {
    text: "Вакансия Frontend-разработчик — конверсия демо 12% (норма 40%). Возможно демо-курс слишком длинный",
    actions: [
      { label: "Редактировать демо", variant: "outline" as const },
    ],
  },
]

// ─── Кандидаты ──────────────────────────────────────────────────────────────

const ATTENTION_CANDIDATES = [
  { name: "Алексей Петров", initials: "АП", vacancy: "Менеджер по продажам", status: "Демо 92%", statusColor: "bg-emerald-500/10 text-emerald-700 border-emerald-200", time: "2 мин назад" },
  { name: "Мария Иванова", initials: "МИ", vacancy: "Frontend-разработчик", status: "Ждёт ответа 2 дн", statusColor: "bg-amber-500/10 text-amber-700 border-amber-200", time: "" },
  { name: "Дмитрий Козлов", initials: "ДК", vacancy: "Менеджер по продажам", status: "Отказ от интервью", statusColor: "bg-red-500/10 text-red-700 border-red-200", time: "" },
  { name: "Елена Сидорова", initials: "ЕС", vacancy: "Бухгалтер", status: "Новый отклик", statusColor: "bg-blue-500/10 text-blue-700 border-blue-200", time: "15 мин назад" },
]

// ─── Воронка ────────────────────────────────────────────────────────────────

const FUNNEL_STEPS = [
  { label: "Отклики", count: 1400, pct: 100, color: "bg-violet-500" },
  { label: "На демо", count: 870, pct: 62, color: "bg-blue-500" },
  { label: "Демо >85%", count: 254, pct: 18, color: "bg-cyan-500" },
  { label: "Интервью", count: 128, pct: 9, color: "bg-amber-500" },
  { label: "Нанято", count: 72, pct: 5, color: "bg-emerald-500" },
]

// ─── AI-агенты ──────────────────────────────────────────────────────────────

const AI_AGENTS = [
  { name: "Скоринг", status: "14 обработано за час", online: true },
  { name: "Рассылка", status: "3 отправлено", online: true },
  { name: "Парсинг резюме", status: "8 новых", online: true },
  { name: "hh.ru синхронизация", status: "Ожидание API", online: false },
]

// ─── Страница ───────────────────────────────────────────────────────────────

export default function Overview2Page() {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Метрики ── */}
          <div className="grid grid-cols-3 gap-4">
            {METRICS.map((m) => (
              <Card key={m.label} className="py-4 gap-0">
                <CardContent className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/10">
                    <m.icon className="w-5 h-5 text-violet-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold">{m.value}</p>
                      {m.badge && (
                        <Badge variant="outline" className={cn("text-[10px] font-medium border-0", m.badgeColor)}>
                          {m.badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Основной контент ── */}
          <div className="grid grid-cols-[2fr_1fr] gap-4 items-start">

            {/* ── Левая колонка: Требуют внимания ── */}
            <Card className="py-0 gap-0">
              <CardHeader className="flex-row items-center justify-between py-4 border-b">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">Требуют внимания</CardTitle>
                  <Badge className="bg-red-500/10 text-red-700 border-red-200 text-[10px]" variant="outline">7</Badge>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  Все задачи <ArrowRight className="w-3 h-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {/* AI-рекомендации */}
                {AI_RECOMMENDATIONS.map((rec, i) => (
                  <div key={i} className="border-l-[3px] border-amber-400 bg-amber-500/5 rounded-r-lg p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-foreground">{rec.text}</p>
                    </div>
                    <div className="flex gap-2 ml-6">
                      {rec.actions.map((a) => (
                        <Button key={a.label} variant={a.variant} size="sm" className="h-7 text-xs">
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Кандидаты */}
                <div className="space-y-0.5 mt-1">
                  {ATTENTION_CANDIDATES.map((c) => (
                    <div key={c.name} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {c.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.vacancy}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={cn("text-[10px] font-medium", c.statusColor)}>
                          {c.status}
                        </Badge>
                        {c.time && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{c.time}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ── Правая колонка ── */}
            <div className="space-y-4">

              {/* Сводка по вакансиям — воронка */}
              <Card className="py-0 gap-0">
                <CardHeader className="py-4 border-b gap-0.5">
                  <CardTitle className="text-sm font-semibold">Сводка по вакансиям</CardTitle>
                  <p className="text-xs text-muted-foreground">Все вакансии</p>
                </CardHeader>
                <CardContent className="p-4 space-y-2.5">
                  {FUNNEL_STEPS.map((step) => (
                    <div key={step.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{step.label}</span>
                        <span className="text-[10px] text-muted-foreground">{step.pct}%</span>
                      </div>
                      <div className="h-7 bg-muted/50 rounded-md overflow-hidden relative">
                        <div
                          className={cn("h-full rounded-md transition-all", step.color)}
                          style={{ width: `${step.pct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-2.5 text-xs font-semibold text-foreground">
                          {step.count.toLocaleString("ru-RU")}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* AI-агенты */}
              <Card className="py-0 gap-0">
                <CardHeader className="flex-row items-center justify-between py-4 border-b">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-violet-600" />
                    <CardTitle className="text-sm font-semibold">AI-агенты</CardTitle>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-[10px]">
                    6 активных
                  </Badge>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {AI_AGENTS.map((agent) => (
                    <div key={agent.name} className="flex items-center gap-3">
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        agent.online ? "bg-emerald-500" : "bg-amber-400"
                      )} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{agent.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{agent.status}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
