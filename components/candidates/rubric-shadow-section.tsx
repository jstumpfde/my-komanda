"use client"

// Shadow-блок рубричного соответствия в карточке кандидата. Считается параллельно
// существующему AI-скору, НЕ влияет на стадию/автодействия — для обкатки и сравнения.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { RubricScoreBadge, RubricBreakdown } from "@/components/scoring/rubric-breakdown"
import type { RubricResult } from "@/lib/scoring/types"

export function RubricShadowSection({ candidateId, initialResult }: { candidateId: string; initialResult?: RubricResult | null }) {
  const [result, setResult] = useState<RubricResult | null>(initialResult ?? null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function score() {
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/rubric-score`, { method: "POST" })
      const data = await res.json()
      if (res.ok) { setResult(data as RubricResult); setExpanded(true) }
      else toast.error(data.error || "Не удалось оценить")
    } catch { toast.error("Ошибка сети") } finally { setLoading(false) }
  }

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Соответствие · рубрика</h3>
          <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">тест</span>
          {result && <RubricScoreBadge result={result} expanded={expanded} onToggle={() => setExpanded(e => !e)} />}
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={loading} onClick={score}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {result ? "Переоценить" : "Оценить"}
        </Button>
      </div>
      {result && expanded && <RubricBreakdown result={result} showMeta={false} />}
    </section>
  )
}
