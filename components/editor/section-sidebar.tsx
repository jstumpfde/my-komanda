"use client"

import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { BLOCK_TYPES, type Section, type BlockType } from "./types"

interface SectionSidebarProps {
  sections: Section[]
  activeBlockId: string | null
  onBlockSelect: (blockId: string) => void
  onToggleBlock: (sectionId: string, blockId: string) => void
  onAddBlock: (sectionId: string, type: BlockType) => void
}

export function SectionSidebar({
  sections,
  activeBlockId,
  onBlockSelect,
  onToggleBlock,
  onAddBlock,
}: SectionSidebarProps) {
  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const enabledCount = section.blocks.filter((b) => b.enabled).length
        const totalCount = section.blocks.length

        return (
          <Collapsible key={section.id} defaultOpen>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors">
              <span className="text-base">{section.emoji}</span>
              <span className="text-sm font-medium flex-1 text-left">
                {section.title}
              </span>
              <Badge variant="secondary" className="text-xs font-normal">
                {enabledCount}/{totalCount}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-2 space-y-0.5 py-1">
                {section.blocks.map((block) => {
                  const meta = BLOCK_TYPES.find((bt) => bt.type === block.type)
                  const isActive = activeBlockId === block.id
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
                        isActive && "bg-primary/5"
                      )}
                    >
                      <Switch
                        checked={block.enabled}
                        onCheckedChange={() =>
                          onToggleBlock(section.id, block.id)
                        }
                        className="scale-75"
                      />
                      <button
                        className="flex-1 text-left text-sm truncate"
                        onClick={() => onBlockSelect(block.id)}
                      >
                        <span className="mr-1.5">{meta?.icon}</span>
                        {meta?.label}
                      </button>
                    </div>
                  )
                })}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs text-muted-foreground h-7 mt-1"
                    >
                      <Plus className="size-3 mr-1" />
                      Добавить блок
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[240px] p-2" align="start">
                    <div className="grid grid-cols-3 gap-1">
                      {BLOCK_TYPES.map((bt) => (
                        <button
                          key={bt.type}
                          className="flex flex-col items-center gap-1 rounded-md p-2 text-xs hover:bg-muted/50 transition-colors"
                          onClick={() => onAddBlock(section.id, bt.type)}
                        >
                          <span>{bt.icon}</span>
                          <span className="text-muted-foreground">
                            {bt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
