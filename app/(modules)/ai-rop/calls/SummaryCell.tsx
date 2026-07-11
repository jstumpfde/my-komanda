"use client"

// Ячейка «Итог» в списке звонков — клик разворачивает summary + next_action.
import { useState } from "react"
import { cn } from "@/lib/utils"

export function SummaryCell({ summary, nextAction }: { summary: string | null; nextAction: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!summary && !nextAction) return <span className="text-muted-foreground">—</span>

  return (
    <div onClick={() => setExpanded((v) => !v)} className="max-w-[340px] cursor-pointer" title={expanded ? "Свернуть" : "Кликните чтобы раскрыть полностью"}>
      {summary && (
        <div className={cn("text-[13px] leading-snug", !expanded && "line-clamp-3", expanded ? "mb-1.5" : "mb-0")}>{summary}</div>
      )}
      {nextAction && (
        <div className={cn("text-xs leading-snug text-muted-foreground", !expanded && "line-clamp-2")}>
          <b className="text-violet-600">След. шаг:</b> {nextAction}
        </div>
      )}
    </div>
  )
}
