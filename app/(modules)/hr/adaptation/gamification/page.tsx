"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, Flame, Trophy, Star, Medal } from "lucide-react"
import { cn } from "@/lib/utils"
import { LEVELS, levelInfo, nextLevelPoints } from "@/lib/gamification/levels"

interface BadgeItem {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string
  points: number
}

interface LeaderRow {
  rank: number
  employeeId: string
  totalPoints: number
  level: number
  levelName: string
  streak: number
}

interface Progress {
  totalPoints: number
  level: number
  levelName: string
  streak: number
  nextLevelPoints: number
  currentLevelMin: number
  progressToNext: number
  earnedBadges: { badge: BadgeItem; earnedAt: string }[]
}

const RANK_ICONS = ["🥇", "🥈", "🥉"]

export default function GamificationPage() {
  const [badges, setBadges] = useState<BadgeItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/gamification/badges").then(r => r.json()),
      fetch("/api/gamification/leaderboard").then(r => r.json()),
    ]).then(([b, l]) => {
      setBadges(Array.isArray(b) ? b : [])
      setLeaderboard(Array.isArray(l) ? l : [])
    }).finally(() => setLoading(false))
  }, [])

  // Collect all earned badge slugs from leaderboard is not available here,
  // so we just show all badges without earned state on this public page
  const earnedSlugsSet = new Set<string>()

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Геймификация</h1>
                <p className="text-sm text-muted-foreground">Лидерборд и бейджи адаптации</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">

                {/* Left: Leaderboard */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Топ-10 сотрудников
                  </h2>
                  {leaderboard.length === 0 ? (
                    <div className="rounded-xl border bg-card p-8 text-center">
                      <Medal className="w-12 h-12 text-muted-foreground/25 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">Данных пока нет</p>
                      <p className="text-sm text-muted-foreground/60 mt-1">
                        Начните адаптацию сотрудников, чтобы здесь появились результаты
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-card overflow-hidden">
                      {leaderboard.map((row) => {
                        const lvl = levelInfo(row.level)
                        const nextMin = nextLevelPoints(row.totalPoints)
                        const curMin = LEVELS.find(l => l.level === row.level)?.min ?? 0
                        const pct = nextMin > curMin
                          ? Math.round(((row.totalPoints - curMin) / (nextMin - curMin)) * 100)
                          : 100

                        return (
                          <div
                            key={row.employeeId}
                            className={cn(
                              "flex items-center gap-4 px-4 py-3 border-b last:border-0",
                              row.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/10"
                            )}
                          >
                            {/* Rank */}
                            <div className="w-8 text-center shrink-0">
                              {row.rank <= 3 ? (
                                <span className="text-lg">{RANK_ICONS[row.rank - 1]}</span>
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">{row.rank}</span>
                              )}
                            </div>

                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {row.employeeId.slice(0, 2).toUpperCase()}
                            </div>

                            {/* Name + progress */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium truncate">
                                  Сотрудник {row.employeeId.slice(0, 8)}
                                </span>
                                {row.streak > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs text-orange-500">
                                    <Flame className="w-3 h-3" />{row.streak}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Progress value={pct} className="h-1.5 flex-1 max-w-[120px]" />
                                <span className="text-[10px] text-muted-foreground">{lvl.name}</span>
                              </div>
                            </div>

                            {/* Points */}
                            <div className="text-right shrink-0">
                              <div className="text-sm font-bold text-primary">{row.totalPoints}</div>
                              <div className="text-[10px] text-muted-foreground">баллов</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Levels reference */}
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mt-6 mb-3">
                    Уровни
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {LEVELS.map(l => (
                      <div key={l.level} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                          {l.level}
                        </div>
                        <div>
                          <p className="text-xs font-medium">{l.name}</p>
                          <p className="text-[10px] text-muted-foreground">{l.min}+ баллов</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Badges */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Бейджи
                  </h2>
                  {badges.length === 0 ? (
                    <div className="rounded-xl border bg-card p-6 text-center">
                      <Star className="w-10 h-10 text-muted-foreground/25 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Бейджи не настроены</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Запустите seed-gamification
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {badges.map(badge => {
                        const earned = earnedSlugsSet.has(badge.slug)
                        return (
                          <div
                            key={badge.id}
                            className={cn(
                              "rounded-lg border bg-card p-3 flex items-center gap-3 transition-opacity",
                              !earned && "opacity-40"
                            )}
                          >
                            <div className="text-2xl shrink-0 w-10 text-center">{badge.icon}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{badge.name}</p>
                              {badge.description && (
                                <p className="text-[11px] text-muted-foreground truncate">{badge.description}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              +{badge.points}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
