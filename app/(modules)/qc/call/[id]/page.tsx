"use client"

import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Sparkles, Lightbulb, Lock, Headphones } from "lucide-react"
import {
  QC_CALLS, QC_CHECKLIST, RESULT_MAP_QC,
  scoreColor, scoreLabel, formatDurationQC,
} from "@/lib/qc/demo-data"

function ScoreCircle({ score }: { score: number }) {
  const color = scoreColor(score)
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (score / 100) * circumference
  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <circle
          cx="60" cy="60" r="54" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
    </div>
  )
}

export default function QCCallDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const call = QC_CALLS.find((c) => c.id === id)

  if (!call) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Звонок не найден</p>
              <Button variant="outline" onClick={() => router.push("/qc")}><ArrowLeft className="w-4 h-4 mr-2" />К дашборду</Button>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const res = RESULT_MAP_QC[call.result]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Top bar */}
            <div className="flex items-center gap-3 mb-6">
              <Button variant="ghost" size="icon" onClick={() => router.push("/qc")}><ArrowLeft className="w-5 h-5" /></Button>
              <Headphones className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">{call.managerName} → {call.clientName}</h1>
                <p className="text-sm text-muted-foreground">
                  {new Date(call.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} в {new Date(call.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {formatDurationQC(call.duration)} · {call.type === "incoming" ? "Входящий" : "Исходящий"}
                </p>
              </div>
              <div className="ml-auto">
                <Badge variant="secondary" className="text-xs font-medium border-0" style={{ backgroundColor: `${res?.color}15`, color: res?.color }}>
                  {res?.label}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Left: score + checklist */}
              <div className="col-span-2 space-y-6">
                {/* Score + label */}
                <div className="rounded-xl border border-border bg-card p-6 text-center">
                  <ScoreCircle score={call.totalScore} />
                  <p className="text-lg font-semibold mt-3" style={{ color: scoreColor(call.totalScore) }}>{scoreLabel(call.totalScore)}</p>
                </div>

                {/* Checklist */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-base font-semibold mb-4">Чек-лист оценки</h3>
                  <div className="space-y-3">
                    {QC_CHECKLIST.map((item) => {
                      const score = call.scores[item.id] ?? 0
                      const pct = Math.round((score / item.weight) * 100)
                      const icon = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌"
                      const barColor = pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444"
                      return (
                        <div key={item.id}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span>{icon}</span>
                              <span className="text-sm font-medium">{item.label}</span>
                              <span className="text-[10px] text-muted-foreground">(макс. {item.weight})</span>
                            </div>
                            <span className="text-sm font-bold" style={{ color: barColor }}>{score}/{item.weight}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Transcript stub */}
                <div className="rounded-xl border-2 border-dashed border-border/60 bg-muted/20 p-6 text-center">
                  <Lock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium mb-1">Транскрипция звонка</p>
                  <p className="text-xs text-muted-foreground mb-3">Подключите IP-телефонию для автоматической записи и анализа</p>
                  <Button variant="outline" size="sm" disabled>Подклю��ить</Button>
                </div>
              </div>

              {/* Right: AI analysis + recommendations */}
              <div className="space-y-4">
                {/* AI Summary */}
                <div className="rounded-xl border bg-gradient-to-br from-[#EEEDFE] via-[#E6F1FB] to-[#F3E8FF] dark:from-[#1a1830] dark:via-[#172030] dark:to-[#1f1530] p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-sm">AI-анализ звонка</span>
                  </div>
                  <p className="text-sm leading-relaxed">{call.aiSummary}</p>
                </div>

                {/* AI Recommendations */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <span className="font-semibold text-sm">Рекомендации</span>
                  </div>
                  <div className="space-y-2">
                    {call.aiRecommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                        <span className="text-sm">💡</span>
                        <p className="text-sm leading-snug">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call info */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="text-sm font-semibold mb-3">Информация</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Менеджер</span><span className="font-medium">{call.managerName}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Клиент</span><span className="font-medium">{call.clientName}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Тип</span><span>{call.type === "incoming" ? "Входящий" : "Исходящий"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Длительность</span><span className="tabular-nums">{formatDurationQC(call.duration)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Настроение</span><span>{call.sentiment === "positive" ? "😊 Позитивное" : call.sentiment === "neutral" ? "😐 Нейтральное" : "😞 Негативное"}</span></div>
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
