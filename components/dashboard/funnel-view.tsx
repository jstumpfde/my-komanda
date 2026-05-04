"use client"

import { useState } from "react"
import { MapPin, Briefcase, Circle, ChevronDown, CheckCircle2, XCircle, ArrowRight, ThumbsUp, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Candidate } from "./candidate-card"
import type { CardDisplaySettings } from "./card-settings"
import type { CandidateAction } from "@/lib/column-config"

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
  settings?: CardDisplaySettings
  onOpenProfile?: (candidate: Candidate, columnId: string) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
}

function getScoreColor(score: number) {
  if (score >= 80) return "border-green-300 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-400"
  if (score >= 60) return "border-yellow-300 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400"
  return "border-red-300 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-400"
}

function getSourceColor(source: string) {
  const colors: Record<string, string> = {
    "hh.ru": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400",
    "Telegram": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400",
    "LinkedIn": "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-400",
    "Реферал": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400",
    "Сайт": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400",
  }
  return colors[source] || "bg-muted text-muted-foreground border-border"
}

// Маппинг ширин для режима воронки.
// Поддерживает как "пользовательские" русские заголовки из задачи,
// так и стандартные дефолтные заголовки из defaultColumnColors.
const FUNNEL_WIDTH_BY_TITLE: Record<string, string> = {
  "Новый": "100%",
  "Отклик": "100%",
  "Демонстрация": "90%",
  "Демо-курс": "90%",
  "Интервью назначено": "80%",
  "Анкета": "80%",
  "AI-скрининг": "70%",
  "Интервью пройдено": "70%",
  "Собеседование": "70%",
  "Оффер": "65%",
  "Нанят": "60%",
}

// Позиционный фолбэк (если заголовок не совпадает с маппингом —
// например, после ручного переименования колонки пользователем).
const FUNNEL_WIDTH_BY_INDEX = ["100%", "90%", "80%", "70%", "60%", "55%", "50%", "45%"]

function getFunnelMaxWidth(title: string, idx: number): string {
  return FUNNEL_WIDTH_BY_TITLE[title] || FUNNEL_WIDTH_BY_INDEX[idx] || "45%"
}

// "Отказ" — терминальный статус, рендерится отдельным блоком справа.
function isRejectedColumn(col: Column): boolean {
  return col.id === "rejected" || col.title === "Отказ"
}

export function FunnelView({ columns, settings, onOpenProfile, onAction }: FunnelViewProps) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const maxCount = Math.max(1, ...columns.map((c) => c.count))

  const conversionRates = columns.map((col, i) => {
    if (columns[0].count === 0) return 0
    if (i === 0) return 100
    return Math.round((col.count / columns[0].count) * 100)
  })

  // Конверсия по id — чтобы корректно доставать значения,
  // когда мы рендерим колонки в отфильтрованных списках (без "Отказа").
  const conversionRateById: Record<string, number> = {}
  columns.forEach((col, i) => {
    conversionRateById[col.id] = conversionRates[i]
  })

  // Основные колонки воронки (без терминального "Отказа").
  const mainColumns = columns.filter((c) => !isRejectedColumn(c))
  const rejectedColumn = columns.find(isRejectedColumn)

  // Карточка-статистика — единый рендер для главных колонок и для "Отказа".
  const renderStatCard = (col: Column) => {
    const rate = conversionRateById[col.id] ?? 0
    const isCardExpanded = expandedCardId === col.id
    return (
      <div
        className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer w-full"
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
  }

  return (
    <div className="space-y-6">
      {/* Funnel Visual */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-6">Воронка найма</h3>
        <div className="space-y-1">
          {columns.map((col, i) => {
            const widthPct = Math.max(20, (col.count / maxCount) * 100)
            const prevCount = i > 0 ? columns[i - 1].count : null
            const passPct = prevCount === null
              ? null
              : prevCount === 0
                ? "empty"
                : Math.round((col.count / prevCount) * 100)

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
                      {passPct === null ? (
                        <div className="text-center">
                          <span className="text-[11px] font-semibold text-primary">100%</span>
                          <p className="text-[10px] text-muted-foreground">вход</p>
                        </div>
                      ) : passPct === "empty" ? (
                        <div className="text-center">
                          <span className="text-[11px] font-semibold text-muted-foreground">—</span>
                          <p className="text-[10px] text-muted-foreground">прошло</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <span className="text-[11px] font-semibold text-emerald-500">
                            {passPct}%
                          </span>
                          <p className="text-[10px] text-muted-foreground">прошло</p>
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

      {/* Stats — tapered funnel + rejected sidecar */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* Основные колонки воронки — вертикальный таппер по центру.
            Ширины убывают сверху вниз: 100% → 90% → 80% → 70% → 60%. */}
        <div className="flex-1 flex flex-col gap-3 items-center w-full min-w-0">
          {mainColumns.map((col, i) => {
            const maxWidth = getFunnelMaxWidth(col.title, i)
            return (
              <div
                key={col.id}
                className="w-full transition-[max-width] duration-300"
                style={{ maxWidth }}
              >
                {renderStatCard(col)}
              </div>
            )
          })}
        </div>

        {/* "Отказ" — терминальный статус, отдельным блоком справа */}
        {rejectedColumn && (
          <div className="w-full lg:w-56 flex-shrink-0 lg:self-start">
            <div className="lg:sticky lg:top-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-1">
                Терминальный
              </p>
              {renderStatCard(rejectedColumn)}
            </div>
          </div>
        )}
      </div>

      {/* Expanded card — full table */}
      {expandedCardId && (() => {
        const col = columns.find(c => c.id === expandedCardId)
        if (!col) return null
        return (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div
              className="h-1.5"
              style={{ background: `linear-gradient(90deg, ${col.colorFrom}, ${col.colorTo})` }}
            />
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h4 className="text-sm font-semibold text-foreground">{col.title}</h4>
              <span className="text-xs text-muted-foreground">{col.count} кандидатов</span>
            </div>

            {col.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Нет кандидатов на этом этапе</p>
            ) : (
              <>
                {/* Table Header */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-2.5 bg-muted/60 border-b border-border text-[13px] font-medium text-muted-foreground tracking-normal">
                  <div>Кандидат</div>
                  {settings?.showScore !== false && <div>AI скор</div>}
                  {(settings?.showSalary || settings?.showSalaryFull) !== false && <div>Зарплата</div>}
                  {settings?.showCity !== false && <div>Город</div>}
                  <div>Статус</div>
                  {settings?.showSource !== false && <div>Источник</div>}
                  <div>Действия</div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border">
                  {col.candidates.map((candidate, i) => {
                    const isDecisionStage = candidate.columnId === "interview" || candidate.columnId === "offer"
                    return (
                      <div
                        key={candidate.id}
                        className={cn(
                          "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-4 px-4 items-center hover:bg-muted/40 transition-colors min-h-[56px] text-[14px]",
                          i % 2 === 0 ? "" : "bg-muted/20"
                        )}
                      >
                        {/* Name + experience */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                            style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                          >
                            {candidate.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium text-foreground truncate">{candidate.name}</p>
                            {settings?.showExperience !== false && (
                              <p className="text-[13px] text-muted-foreground truncate">{candidate.experience}</p>
                            )}
                          </div>
                        </div>

                        {/* Score */}
                        {settings?.showScore !== false && (
                          <div>
                            <Badge variant="outline" className={cn("text-[14px] border font-semibold", getScoreColor(candidate.score))}>
                              {candidate.score}
                            </Badge>
                          </div>
                        )}

                        {/* Salary */}
                        {(settings?.showSalary || settings?.showSalaryFull) !== false && (
                          <div className="text-[14px] font-medium text-foreground">
                            {settings?.showSalaryFull
                              ? `${candidate.salaryMin.toLocaleString("ru-RU")} — ${candidate.salaryMax.toLocaleString("ru-RU")} ₽`
                              : `${Math.round(candidate.salaryMin / 1000)}-${Math.round(candidate.salaryMax / 1000)}k`
                            }
                          </div>
                        )}

                        {/* City */}
                        {settings?.showCity !== false && (
                          <div className="flex items-center gap-1 text-[14px] text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{candidate.city}</span>
                          </div>
                        )}

                        {/* Stage badge */}
                        <div>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                            style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                          >
                            {candidate.columnTitle}
                          </span>
                        </div>

                        {/* Source */}
                        {settings?.showSource !== false && (
                          <div>
                            <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
                              {candidate.source}
                            </Badge>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {isDecisionStage ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10" title="Принять" onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}>
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Отказать" onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}>
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-warning hover:bg-warning/10" title="В резерв" onClick={() => onAction?.(candidate.id, candidate.columnId, "reserve")}>
                                <Clock className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10" title="Пригласить" onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Отказать" onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}>
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            title="Открыть"
                            onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
