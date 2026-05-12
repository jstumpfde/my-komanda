"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizes?: number[]
  className?: string
}

// Окно из 5 номеров (текущая ± 2) + первая/последняя с многоточиями.
// Если страниц ≤ 7 — показываем все без сокращения (нет смысла прятать).
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const items: (number | "…")[] = [1]
  const left  = Math.max(2, page - 2)
  const right = Math.min(totalPages - 1, page + 2)
  if (left > 2) items.push("…")
  for (let i = left; i <= right; i++) items.push(i)
  if (right < totalPages - 1) items.push("…")
  items.push(totalPages)
  return items
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizes = [20, 50, 100],
  className,
}: Props) {
  // Не рендерим пагинатор когда страница ровно одна И селектор размера тоже
  // не нужен (всего < минимального шага). Иначе селектор остаётся —
  // он управляет порогом отображения и при total=0 тоже виден.
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(total, page * pageSize)
  const window = pageWindow(page, totalPages)

  return (
    <div className={cn("flex items-center justify-between gap-4 flex-wrap text-sm", className)}>
      <div className="text-muted-foreground">
        Показано <span className="text-foreground font-medium">{from}–{to}</span>{" "}
        из <span className="text-foreground font-medium">{total}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Назад
        </Button>

        <div className="flex items-center gap-1">
          {window.map((n, idx) =>
            n === "…" ? (
              <span key={`gap-${idx}`} className="px-1.5 text-muted-foreground select-none">…</span>
            ) : (
              <Button
                key={n}
                variant={n === page ? "default" : "outline"}
                size="sm"
                className="h-8 min-w-8 px-2 tabular-nums"
                onClick={() => onPageChange(n)}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </Button>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Вперёд
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">По</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number.parseInt(v, 10))}
        >
          <SelectTrigger className="h-8 w-[72px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">на стр.</span>
      </div>
    </div>
  )
}
