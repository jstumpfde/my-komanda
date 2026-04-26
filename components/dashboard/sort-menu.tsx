"use client"

import { ArrowUpDown, ArrowDown, ArrowUp, BarChart3, Sparkles, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { CandidateSortMode } from "@/lib/candidate-sort"

const SORT_OPTIONS: Array<{ value: CandidateSortMode; label: string; icon: React.ElementType }> = [
  { value: "date_desc",     label: "По дате (новые сверху)", icon: ArrowDown },
  { value: "date_asc",      label: "По дате (старые сверху)", icon: ArrowUp },
  { value: "demo_progress", label: "По прогрессу демо",       icon: BarChart3 },
  { value: "ai_score",      label: "По AI-скору",             icon: Sparkles },
  { value: "favorite",      label: "Избранные сверху",        icon: Star },
]

interface SortMenuProps {
  sortMode: CandidateSortMode
  onSortChange: (mode: CandidateSortMode) => void
}

export function SortMenu({ sortMode, onSortChange }: SortMenuProps) {
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortMode)?.label ?? "Сортировка"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{sortLabel}</span>
          <span className="sm:hidden">Сортировка</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {SORT_OPTIONS.map(opt => {
          const Icon = opt.icon
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onSortChange(opt.value)}
              className={cn(sortMode === opt.value && "bg-accent")}
            >
              <Icon className="w-3.5 h-3.5 mr-2" />
              {opt.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
