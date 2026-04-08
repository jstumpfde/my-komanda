"use client"

import { Plus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BLOCK_TYPES, type BlockType } from "./types"

interface AddBlockButtonProps {
  onAdd: (type: BlockType) => void
}

export function AddBlockButton({ onAdd }: AddBlockButtonProps) {
  return (
    <div className="flex justify-center py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary mx-auto flex items-center justify-center transition-colors">
            <Plus className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[280px] p-2" align="center">
          <div className="grid grid-cols-3 gap-1">
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.type}
                className="flex flex-col items-center gap-1 rounded-md p-2 text-sm hover:bg-muted/50 transition-colors"
                onClick={() => onAdd(bt.type)}
              >
                <span className="text-lg">{bt.icon}</span>
                <span className="text-xs text-muted-foreground">{bt.label}</span>
              </button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
