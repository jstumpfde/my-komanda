"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Trophy, Loader2, ChevronRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

interface LeaderboardEntry {
  userId: string
  name: string
  position: string | null
  totalPoints: number
  lessons: number
  courses: number
  tests: number
  trainings: number
}

interface RecentAchievement {
  id: string
  type: string
  points: number
  note: string | null
  earnedAt: string
  userName: string | null
}

interface AchievementsResponse {
  leaderboard: LeaderboardEntry[]
  recent: RecentAchievement[]
  myPoints: number
}

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  lesson:       { label: "Урок",       emoji: "✅" },
  course:       { label: "Курс",       emoji: "📚" },
  test_perfect: { label: "Идеальный тест", emoji: "💯" },
  training:     { label: "Тренировка", emoji: "🎯" },
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "только что"
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const dd = Math.floor(h / 24)
  if (dd < 7) return `${dd} дн назад`
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

export default function AchievementsPage() {
  const [data, setData] = useState<AchievementsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/modules/knowledge/achievements?limit=20")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d as AchievementsResponse) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/learning/dashboard" className="hover:text-foreground transition-colors">Обучение</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Рейтинг</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy className="size-5 text-amber-500" />
                  <h1 className="text-xl font-semibold">Рейтинг обучения</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Баллы начисляются за уроки (+10), курсы (+50), идеальные тесты (+30) и тренировки (+20)
                </p>
              </div>
              {data && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 px-4 py-3">
                  <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <Sparkles className="size-3" />
                    Ваши баллы
                  </div>
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {data.myPoints}
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Загрузка...
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Leaderboard */}
                <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold mb-4">Лидерборд</h3>
                  {(data?.leaderboard ?? []).length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Пока нет начислений. Пройдите первую тренировку или курс чтобы появиться в рейтинге.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data!.leaderboard.map((l, i) => {
                        const medal = ["🥇", "🥈", "🥉"][i] ?? null
                        return (
                          <div
                            key={l.userId}
                            className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-3"
                          >
                            <div className={cn(
                              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                              i === 0 && "bg-amber-500/20 border border-amber-400",
                              i === 1 && "bg-slate-400/20 border border-slate-400",
                              i === 2 && "bg-orange-500/20 border border-orange-400",
                              i > 2 && "bg-background border",
                            )}>
                              {medal ?? i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{l.name}</div>
                              {l.position && (
                                <div className="text-xs text-muted-foreground truncate">{l.position}</div>
                              )}
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                {l.trainings > 0 && <span>🎯 {l.trainings}</span>}
                                {l.courses > 0 && <span>📚 {l.courses}</span>}
                                {l.lessons > 0 && <span>✅ {l.lessons}</span>}
                                {l.tests > 0 && <span>💯 {l.tests}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                {l.totalPoints}
                              </div>
                              <div className="text-[10px] text-muted-foreground -mt-0.5">баллов</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Recent achievements */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold mb-4">Недавние начисления</h3>
                  {(data?.recent ?? []).length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Пока нет начислений
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data!.recent.slice(0, 15).map((r) => {
                        const meta = TYPE_META[r.type] ?? { label: r.type, emoji: "⭐" }
                        return (
                          <div key={r.id} className="flex items-start gap-2.5 py-1.5 border-b border-border/50 last:border-0">
                            <span className="text-base leading-none pt-0.5">{meta.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">{r.userName ?? "—"}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {r.note || meta.label}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatRelative(r.earnedAt)}
                              </div>
                            </div>
                            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">
                              +{r.points}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
