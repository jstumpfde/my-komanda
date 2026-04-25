"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Play, Square, FlaskConical, Loader2, CheckCircle2, XCircle } from "lucide-react"

interface Result {
  id: string
  name: string | null
  action: string
  score?: number
  reason?: string
  error?: string
}

interface HhAutoProcessProps {
  onProcessed?: () => void
}

export function HhAutoProcess({ onProcessed }: HhAutoProcessProps = {}) {
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [limit, setLimit] = useState(5)
  const [results, setResults] = useState<Result[]>([])
  const [lastRunType, setLastRunType] = useState<"dry" | "live" | null>(null)

  const run = async (dryRun: boolean) => {
    setRunning(true)
    setResults([])
    setLastRunType(dryRun ? "dry" : "live")
    try {
      const res = await fetch("/api/integrations/hh/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Ошибка")
      setResults(data.results || [])
      toast.success(dryRun
        ? `Сухой прогон: обработано ${data.processed}`
        : `Разобрано ${data.processed} откликов`)
      if (!dryRun) onProcessed?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setRunning(false)
    }
  }

  const stop = async () => {
    setStopping(true)
    try {
      await fetch("/api/integrations/hh/process-queue", { method: "DELETE" })
      toast("🛑 Остановка отправлена")
    } finally {
      setStopping(false)
    }
  }

  return (
    <Card className="max-w-3xl mb-5 border-blue-200 dark:border-blue-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">🤖 Автоматический разбор откликов с hh.ru</CardTitle>
        <CardDescription>
          AI оценит резюме под вакансию: score ≥ 60 → приглашение + демо-ссылка + карточка в канбане, иначе — мягкий отказ. Все действия публикуются в hh.ru.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Сколько откликов обработать:</span>
          {[3, 5, 10, 25].map(n => (
            <Button
              key={n}
              size="sm"
              variant={limit === n ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => setLimit(n)}
              disabled={running}
            >
              {n}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => run(true)} disabled={running} variant="outline" size="sm" className="gap-1.5">
            {running && lastRunType === "dry"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Прогон…</>
              : <><FlaskConical className="w-3.5 h-3.5" /> Сухой прогон (без отправки)</>}
          </Button>
          <Button onClick={() => run(false)} disabled={running} size="sm" className="gap-1.5">
            {running && lastRunType === "live"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Разбираю…</>
              : <><Play className="w-3.5 h-3.5" /> Разобрать {limit} откликов</>}
          </Button>
          {running && (
            <Button onClick={stop} disabled={stopping} variant="destructive" size="sm" className="gap-1.5">
              <Square className="w-3.5 h-3.5" /> {stopping ? "Останавливаю…" : "🛑 Стоп"}
            </Button>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              Результат {lastRunType === "dry" ? "сухого прогона" : "разбора"}:
            </p>
            {results.map((r, i) => {
              const isInvite = r.action.includes("invitation")
              const isDiscard = r.action.includes("discard")
              const isFailed = r.action === "failed"
              const isStopped = r.action === "stopped"
              return (
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/30">
                  {isInvite && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />}
                  {isDiscard && <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />}
                  {(isFailed || isStopped) && <XCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.name || "Без имени"}</span>
                      {typeof r.score === "number" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">score {r.score}</Badge>
                      )}
                      <Badge variant={isInvite ? "default" : isDiscard ? "secondary" : "outline"} className="text-[10px] h-4 px-1.5">
                        {isInvite ? "Приглашён + демо" : isDiscard ? "Отказ" : isFailed ? "Ошибка" : isStopped ? "Остановлено" : r.action}
                      </Badge>
                    </div>
                    {r.reason && <p className="text-muted-foreground mt-0.5">{r.reason}</p>}
                    {r.error && <p className="text-destructive mt-0.5">{r.error}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
