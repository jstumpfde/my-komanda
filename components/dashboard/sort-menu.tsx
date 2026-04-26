"use client"

import { ArrowUpDown, ArrowDown, ArrowUp, BarChart3, Sparkles, Star, Check } from "lucide-react"
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <ArrowUpDown className="w-3.5 h-3.5" />
          Сортировка
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {SORT_OPTIONS.map(opt => {
          const Icon = opt.icon
          const active = sortMode === opt.value
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onSortChange(opt.value)}
              className={cn("flex items-center", active && "bg-accent")}
            >
              <Icon className="w-3.5 h-3.5 mr-2" />
              <span className="flex-1">{opt.label}</span>
              {active && <Check className="w-3.5 h-3.5 ml-2 text-foreground/70" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
