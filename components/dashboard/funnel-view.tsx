"use client"

import { useState } from "react"
import { MapPin, Briefcase, Circle, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Candidate } from "./candidate-card"

interface Column {
  id: string
  title: string
  count: number
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

interface FunnelViewProps {
  columns: Column[]
}

function formatTimeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 60) return `${diffMins} мин. назад`
  if (diffHours < 24) return `${diffHours} ч. назад`
  if (diffDays === 1) return "вчера"
  if (diffDays < 7) return `${diffDays} дн. назад`
  return `${Math.floor(diffDays / 7)} нед. назад`
}

export function FunnelView({ columns }: FunnelViewProps) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const maxCount = Math.max(...columns.map((c) => c.count))

  const conversionRates = columns.map((col, i) => {
    if (i === 0) return 100
    return Math.round((col.count / columns[0].count) * 100)
  })

  return (
    <div className="space-y-6">
      {/* Funnel Visual */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-6">Воронка найма</h3>
        <div className="space-y-1">
          {columns.map((col, i) => {
            const widthPct = Math.max(20, (col.count / maxCount) * 100)
            const dropPct = i > 0
              ? Math.round(((columns[i - 1].count - col.count) / columns[i - 1].count) * 100)
              : null

            return (
              <div key={col.id}>
                {/* Row */}
                <div className="flex items-center gap-4 group py-1">
                  {/* Stage label */}
                  <div className="w-28 flex-shrink-0 text-right">
                    <span className="text-xs font-medium text-foreground">{col.title}</span>
                  </div>

                  {/* Bar */}
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 h-10 bg-muted/40 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg flex items-center justify-end pr-3 transition-all duration-500 group-hover:brightness-110"
                        style={{
                          width: `${widthPct}%`,
                          background: `linear-gradient(135deg, ${col.colorFrom}, ${col.colorTo})`,
                        }}
                      >
                        <span className="text-white text-xs font-bold">{col.count}</span>
                      </div>
                    </div>

                    {/* Conversion */}
                    <div className="w-16 flex-shrink-0">
                      {dropPct !== null ? (
                        <div className="text-center">
                          <span className={`text-[11px] font-semibold ${dropPct > 50 ? "text-destructive" : "text-success"}`}>
                            -{dropPct}%
                          </span>
                          <p className="text-[10px] text-muted-foreground">отсев</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <span className="text-[11px] font-semibold text-primary">100%</span>
                          <p className="text-[10px] text-muted-foreground">вход</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {columns.map((col, i) => {
          const rate = conversionRates[i]
          const isCardExpanded = expandedCardId === col.id
          return (
            <div 
              key={col.id} 
              className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedCardId(isCardExpanded ? null : col.id)}
            >
              <div
                className="h-1"
                style={{ background: `linear-gradient(90deg, ${col.colorFrom}, ${col.colorTo})` }}
              />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground mb-1 truncate">{col.title}</p>
                  <ChevronDown 
                    className="size-3.5 text-muted-foreground transition-transform duration-200"
                    style={{ transform: isCardExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </div>
                <p
                  className="text-2xl font-bold"
                  style={{ backgroundImage: `linear-gradient(135deg, ${col.colorFrom}, ${col.colorTo})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  {col.count}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${rate}%`,
                        background: `linear-gradient(90deg, ${col.colorFrom}, ${col.colorTo})`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{rate}%</span>
                </div>
                {col.candidates.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {col.candidates.slice(0, 2).map((c) => (
                      <p key={c.id} className="text-[10px] text-muted-foreground truncate">• {c.name}</p>
                    ))}
                    {col.candidates.length > 2 && (
                      <p className="text-[10px] text-muted-foreground">+{col.candidates.length - 2} ещё</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Expanded card candidate list */}
      {expandedCardId && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {(() => {
            const col = columns.find(c => c.id === expandedCardId)
            if (!col) return null
            return (
              <>
                <div 
                  className="h-1.5" 
                  style={{ background: `linear-gradient(90deg, ${col.colorFrom}, ${col.colorTo})` }}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-foreground">{col.title}</h4>
                    <span className="text-xs text-muted-foreground">{col.count} кандидатов</span>
                  </div>
                  {col.candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет кандидатов на этом этапе</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {col.candidates.map((candidate) => {
                        const isOnline = candidate.lastSeen === "online"
                        return (
                          <div
                            key={candidate.id}
                            className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                          >
                            <div
                              className="size-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                              style={{ background: `linear-gradient(135deg, ${col.colorFrom}, ${col.colorTo})` }}
                            >
                              {candidate.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">{candidate.name}</span>
                                {isOnline ? (
                                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                    <Circle className="size-1.5 fill-current" />
                                    онлайн
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                    {formatTimeAgo(candidate.lastSeen as Date)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <MapPin className="size-3" />
                                  {candidate.city}
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Briefcase className="size-3" />
                                  {candidate.experience}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs font-medium text-foreground flex-shrink-0">
                              {(candidate.salaryMin / 1000).toFixed(0)}–{(candidate.salaryMax / 1000).toFixed(0)}k
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold flex-shrink-0 ${
                                candidate.score >= 80
                                  ? "border-green-300 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-400"
                                  : candidate.score >= 60
                                  ? "border-yellow-300 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400"
                                  : "border-red-300 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-400"
                              }`}
                            >
                              {candidate.score}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
