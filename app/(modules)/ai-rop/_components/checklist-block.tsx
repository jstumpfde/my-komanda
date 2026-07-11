"use client"

// Чек-лист AI-разбора звонка — сгруппирован по блокам (block), каждый пункт
// раскрывается (детали/notes). Порт визуала из calls/[id] ca-src, на shadcn
// Accordion-подобной разметке (details/summary — без лишней зависимости).
import { CheckCircle2, MinusCircle, XCircle, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ChecklistScoreItem {
  id: string
  title: string
  score: number // 0..1
  notes?: string
  block?: string
}

function scoreColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (pct >= 40) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}
function scoreBg(pct: number): string {
  if (pct >= 80) return "bg-emerald-500"
  if (pct >= 40) return "bg-amber-500"
  return "bg-red-500"
}

export function ChecklistBlock({ items }: { items: ChecklistScoreItem[] }) {
  if (items.length === 0) return null

  const total = items.reduce((s, x) => s + (x.score || 0), 0)
  const pctTotal = Math.round((total / items.length) * 100)

  const blocks: { name: string; items: ChecklistScoreItem[] }[] = []
  for (const it of items) {
    const name = (it.block || "").trim() || "Без блока"
    let blk = blocks.find((b) => b.name === name)
    if (!blk) { blk = { name, items: [] }; blocks.push(blk) }
    blk.items.push(it)
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="size-4 text-violet-600" />
          Чек-лист
          <span className="font-normal text-muted-foreground">· {items.length} пунктов</span>
        </h3>
        <span className={cn("text-sm font-semibold", scoreColor(pctTotal))}>Итог {pctTotal}%</span>
      </div>

      <div className="space-y-3">
        {blocks.map((blk) => {
          const avg = blk.items.reduce((s, x) => s + (x.score || 0), 0) / blk.items.length
          const pct = Math.round(avg * 100)
          return (
            <details key={blk.name} open className="rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs font-semibold">
                <span>{blk.name} <span className="font-normal text-muted-foreground">· {blk.items.length}</span></span>
                <span className={scoreColor(pct)}>{pct}%</span>
              </summary>
              <div>
                {blk.items.map((it) => {
                  const itemPct = Math.round(Math.max(0, Math.min(1, it.score)) * 100)
                  const hasNotes = !!(it.notes && it.notes.trim() && it.notes !== "—")
                  const Icon = itemPct >= 80 ? CheckCircle2 : itemPct >= 40 ? MinusCircle : XCircle
                  return (
                    <details key={it.id} className="border-t px-3 py-1.5">
                      <summary className={cn("grid list-none cursor-default grid-cols-[16px_1fr_42px] items-center gap-2 text-sm", hasNotes && "cursor-pointer")}>
                        <Icon className={cn("size-3.5", scoreColor(itemPct))} />
                        <span className="truncate" title={it.title}>{it.title}</span>
                        <span className={cn("text-right text-xs font-semibold", scoreColor(itemPct))}>{itemPct}%</span>
                      </summary>
                      {hasNotes && (
                        <div className="py-1.5 pl-6 text-xs leading-relaxed text-muted-foreground">{it.notes}</div>
                      )}
                    </details>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

/** Тонкая полоска-бар для одиночного значения 0..1 (используется в дашборде). */
export function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", scoreBg(pct))} style={{ width: `${pct}%` }} />
    </div>
  )
}
