"use client"

// Лаборатория скоринга (прототип): спецификация вакансии «Помощник по маркетингу»
// + примеры резюме. Движок реально зовёт Claude и показывает раскладку «почему N%».
// Открыть: /hr/scoring-lab
//
// Компактный вид: балл + вердикт показываются в шапке кандидата (как будет в
// реальной карточке), детальная раскладка сворачивается/раскрывается по клику.

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { FlaskConical, Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle, Quote, ChevronDown, ChevronUp } from "lucide-react"
import { MARKETING_SPEC, SAMPLE_CANDIDATES } from "@/lib/scoring/sample-marketing"
import { WEIGHT_LABELS, type RubricResult, type WeightLevel, type Verdict } from "@/lib/scoring/types"

const WEIGHT_BADGE: Record<WeightLevel, string> = {
  critical:   "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  important:  "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  nice:       "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  irrelevant: "bg-muted text-muted-foreground border-border",
}

const VERDICT_CFG: Record<Verdict, { label: string; short: string; color: string; chip: string; icon: typeof CheckCircle2 }> = {
  strong: { label: "Сильное соответствие", short: "сильный",      color: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: CheckCircle2 },
  maybe:  { label: "Под вопросом",          short: "под вопросом", color: "text-amber-600 dark:text-amber-400",     chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",       icon: AlertTriangle },
  weak:   { label: "Слабое соответствие",   short: "слабый",       color: "text-muted-foreground",                  chip: "bg-muted text-muted-foreground border-border",                                                    icon: AlertTriangle },
  reject: { label: "Стоп-фактор — отказ",   short: "отказ",        color: "text-red-600 dark:text-red-400",         chip: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",                  icon: XCircle },
}

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

interface CardState {
  resume: string
  loading: boolean
  result: RubricResult | null
  error: string | null
  expanded: boolean
}

export default function ScoringLabPage() {
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(SAMPLE_CANDIDATES.map(c => [c.id, { resume: c.resume, loading: false, result: null, error: null, expanded: false }])),
  )

  function patch(id: string, p: Partial<CardState>) {
    setCards(prev => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  async function score(id: string) {
    patch(id, { loading: true, error: null, result: null })
    try {
      const res = await fetch("/api/dev/score-rubric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: MARKETING_SPEC, resume: cards[id].resume }),
      })
      const data = await res.json()
      if (!res.ok) { patch(id, { loading: false, error: data.error || "Ошибка" }); return }
      patch(id, { loading: false, result: data as RubricResult })
    } catch {
      patch(id, { loading: false, error: "Ошибка сети" })
    }
  }

  async function scoreAll() {
    for (const c of SAMPLE_CANDIDATES) await score(c.id)
  }

  // Раскрыть/свернуть все оценённые карточки.
  const anyExpanded = Object.values(cards).some(c => c.result && c.expanded)
  function toggleAll() {
    setCards(prev => Object.fromEntries(
      Object.entries(prev).map(([id, c]) => [id, { ...c, expanded: c.result ? !anyExpanded : c.expanded }]),
    ))
  }
  const scoredCount = Object.values(cards).filter(c => c.result).length

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14 max-w-[1400px]">

            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Лаборатория скоринга</h1>
              <Badge variant="outline" className="ml-2">прототип</Badge>
            </div>
            <p className="text-muted-foreground text-sm mb-5">
              Рубричное сопоставление резюме со спецификацией вакансии. Каждый критерий оценивается отдельно
              (0–100 + доказательство), итог считается кодом как взвешенная сумма. Спецификация кэшируется (prompt cache).
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">

              {/* Спецификация вакансии */}
              <Card className="h-fit lg:sticky lg:top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{MARKETING_SPEC.vacancyTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{MARKETING_SPEC.positionSummary}</p>
                  <div>
                    <p className="font-medium mb-1.5">Критерии и веса</p>
                    <div className="space-y-1.5">
                      {MARKETING_SPEC.criteria.map(c => (
                        <div key={c.key} className="flex items-center justify-between gap-2">
                          <span className="text-foreground">{c.label}</span>
                          <Badge variant="outline" className={cn("text-xs shrink-0", WEIGHT_BADGE[c.weight])}>{WEIGHT_LABELS[c.weight]}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  {MARKETING_SPEC.knockouts?.length ? (
                    <div>
                      <p className="font-medium mb-1 text-red-600 dark:text-red-400">Жёсткие стоп-факторы</p>
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                        {MARKETING_SPEC.knockouts.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <Button onClick={scoreAll} className="w-full gap-1.5">
                    <Sparkles className="w-4 h-4" />Оценить всех
                  </Button>
                  {scoredCount > 0 && (
                    <Button onClick={toggleAll} variant="outline" className="w-full gap-1.5">
                      {anyExpanded ? <><ChevronUp className="w-4 h-4" />Свернуть все</> : <><ChevronDown className="w-4 h-4" />Раскрыть все</>}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Кандидаты */}
              <div className="space-y-4">
                {SAMPLE_CANDIDATES.map(c => {
                  const st = cards[c.id]
                  const v = st.result ? VERDICT_CFG[st.result.verdict] : null
                  return (
                    <Card key={c.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            {c.label}
                            <span className="text-xs font-normal text-muted-foreground">({c.hint})</span>
                            {/* Балл + вердикт прямо в шапке, кликабельно → раскрыть разбор */}
                            {st.result && v && (
                              <button
                                type="button"
                                onClick={() => patch(c.id, { expanded: !st.expanded })}
                                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", v.chip)}
                              >
                                <span className="tabular-nums">{st.result.total}%</span>
                                <span className="font-medium">· {v.short}</span>
                                {st.expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </CardTitle>
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={st.loading} onClick={() => score(c.id)}>
                            {st.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {st.result ? "Переоценить" : "Оценить"}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Textarea
                          value={st.resume}
                          onChange={e => patch(c.id, { resume: e.target.value })}
                          className="min-h-[110px] text-sm font-mono"
                        />

                        {st.error && <p className="text-sm text-red-600 dark:text-red-400">{st.error}</p>}

                        {st.result && st.expanded && <ResultDetails result={st.result} />}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

// Детальная раскладка (раскрывается по клику на бейдж балла).
function ResultDetails({ result }: { result: RubricResult }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      {result.knockoutHit && (
        <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Сработал стоп-фактор: <b>{result.knockoutHit}</b> → автоматический отказ (балл 0).</span>
        </div>
      )}

      <p className="text-sm text-foreground">{result.summary}</p>

      <div className="space-y-2.5 pt-1">
        {result.criteria.map(c => (
          <div key={c.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-foreground">{c.label}</span>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", WEIGHT_BADGE[c.weight])}>{WEIGHT_LABELS[c.weight]}</Badge>
              </span>
              <span className={cn("font-semibold tabular-nums", scoreColor(c.score))}>{c.score}</span>
            </div>
            <Progress value={c.score} className="h-1.5" />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Quote className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
              <span>{c.evidence} <span className="opacity-60">· увер.: {c.confidence}</span></span>
            </p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
        модель: {result.model} · prompt-cache: запись {result.cache.creationTokens} / чтение {result.cache.readTokens} токенов
      </p>
    </div>
  )
}
