"use client"

import { Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { Variable } from "./types"

interface VariablePickerProps {
  variables: Variable[]
  onInsert: (key: string) => void
}

export function VariablePicker({ variables, onInsert }: VariablePickerProps) {
  const grouped = variables.reduce<Record<string, Variable[]>>((acc, v) => {
    if (!acc[v.group]) acc[v.group] = []
    acc[v.group].push(v)
    return acc
  }, {})

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Hash className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-3">
          {Object.entries(grouped).map(([group, vars]) => (
            <div key={group}>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                {group}
              </div>
              <div className="space-y-0.5">
                {vars.map((v) => (
                  <button
                    key={v.key}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                    onClick={() => onInsert(v.key)}
                  >
                    <code className="text-xs font-mono text-muted-foreground">
                      {`{{${v.key}}}`}
                    </code>
                    <span className="text-foreground">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
