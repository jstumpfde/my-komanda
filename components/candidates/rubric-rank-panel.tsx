"use client"

// Панель «Соответствие · рубрика» на вкладке кандидатов вакансии.
// Кнопка батч-оценки → ранжированный список (лучшие сверху), клик → открыть карточку.
// Shadow: не влияет на стадию/автодействия.

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Ranked { id: string; name: string | null; total: number; verdict: string }

const VERDICT_SHORT: Record<string, string> = { strong: "сильный", maybe: "под вопросом", weak: "слабый", reject: "отказ" }
function color(t: number) {
  return t >= 75 ? "text-emerald-600 dark:text-emerald-400" : t >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
}

export function RubricRankPanel({ vacancyId, onOpenCandidate }: { vacancyId: string; onOpenCandidate: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ranked, setRanked] = useState<Ranked[] | null>(null)
  const [hasMore, setHasMore] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/rubric-score-all`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setRanked(prev => mergeRanked(prev, data.ranked))
        setHasMore(!!data.hasMore)
        setOpen(true)
        toast.success(`Оценено: ${data.scored}${data.hasMore ? " (есть ещё — нажми «Дооценить»)" : ""}`)
      } else toast.error(data.error || "Не удалось оценить")
    } catch { toast.error("Ошибка сети") } finally { setLoading(false) }
  }

  return (
    <Card className="mb-4 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--ai)]" />
          <span className="text-sm font-medium text-[var(--ai)]">Соответствие · рубрика</span>
          <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">тест</span>
          {ranked && <span className="text-xs text-muted-foreground">оценено {ranked.length}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {ranked && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setOpen(o => !o)}>
              {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={loading} onClick={run}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {ranked ? "Дооценить" : "Оценить рубрикой"}
          </Button>
        </div>
      </div>

      {open && ranked && (
        <div className="mt-3 space-y-0.5">
          {ranked.length === 0 && (
            <p className="text-xs text-muted-foreground">Нет кандидатов для оценки — нужны ответы анкеты или навыки в резюме.</p>
          )}
          {ranked.map((r, i) => (
            <button
              key={r.id}
              onClick={() => onOpenCandidate(r.id)}
              className="w-full flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 text-left"
            >
              <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}.</span>
              <span className="text-sm flex-1 truncate">{r.name || "—"}</span>
              <span className={cn("text-sm font-semibold tabular-nums", color(r.total))}>{r.total}%</span>
              <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{VERDICT_SHORT[r.verdict] ?? r.verdict}</span>
            </button>
          ))}
          {hasMore && <p className="text-xs text-muted-foreground pt-1.5">Показаны первые партии по 50. «Дооценить» — оценить остальных.</p>}
        </div>
      )}
    </Card>
  )
}

// Сливает новую партию с уже показанными и сортирует по убыванию балла.
function mergeRanked(prev: Ranked[] | null, next: Ranked[]): Ranked[] {
  const map = new Map<string, Ranked>()
  for (const r of prev ?? []) map.set(r.id, r)
  for (const r of next) map.set(r.id, r)
  return [...map.values()].sort((a, b) => b.total - a.total)
}
