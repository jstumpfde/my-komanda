"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Pipette } from "lucide-react"
import { cn } from "@/lib/utils"

const PRESET_COLORS = [
  { from: "#6366f1", to: "#8b5cf6" },
  { from: "#3b82f6", to: "#06b6d4" },
  { from: "#10b981", to: "#059669" },
  { from: "#f59e0b", to: "#f97316" },
  { from: "#ec4899", to: "#f43f5e" },
  { from: "#ef4444", to: "#dc2626" },
  { from: "#8b5cf6", to: "#a855f7" },
  { from: "#06b6d4", to: "#0ea5e9" },
  { from: "#64748b", to: "#475569" },
  { from: "#84cc16", to: "#22c55e" },
]

interface ColumnColorPickerProps {
  colorFrom: string
  colorTo: string
  onColorChange: (from: string, to: string) => void
  title?: string
  onTitleChange?: (title: string) => void
}

export function ColumnColorPicker({ colorFrom, colorTo, onColorChange, title, onTitleChange }: ColumnColorPickerProps) {
  const [localFrom, setLocalFrom] = useState(colorFrom)
  const [localTo, setLocalTo] = useState(colorTo)

  const handlePreset = (from: string, to: string) => {
    setLocalFrom(from)
    setLocalTo(to)
    onColorChange(from, to)
  }

  const handleCustom = (type: "from" | "to", value: string) => {
    if (type === "from") {
      setLocalFrom(value)
      onColorChange(value, localTo)
    } else {
      setLocalTo(value)
      onColorChange(localFrom, value)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-md hover:bg-white/20"
          title="Изменить цвет"
        >
          <Pipette className="w-3.5 h-3.5 text-white/70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="end" side="bottom">
        {onTitleChange && (
          <div className="mb-3">
            <label className="text-[11px] text-muted-foreground font-medium">Название</label>
            <Input
              value={title || ""}
              onChange={(e) => onTitleChange(e.target.value)}
              className="h-8 text-sm mt-1"
            />
          </div>
        )}
        <p className="text-xs font-medium text-foreground mb-2">Цвет статуса</p>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {PRESET_COLORS.map((preset) => (
            <button
              key={`${preset.from}-${preset.to}`}
              onClick={() => handlePreset(preset.from, preset.to)}
              className={cn(
                "h-7 w-full rounded-md border-2 transition-all",
                colorFrom === preset.from ? "border-foreground scale-110" : "border-transparent hover:border-foreground/40"
              )}
              style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
            />
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted-foreground w-12">Начало</label>
            <input
              type="color"
              value={localFrom}
              onChange={(e) => handleCustom("from", e.target.value)}
              className="h-7 w-full rounded cursor-pointer border border-border"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted-foreground w-12">Конец</label>
            <input
              type="color"
              value={localTo}
              onChange={(e) => handleCustom("to", e.target.value)}
              className="h-7 w-full rounded cursor-pointer border border-border"
            />
          </div>
        </div>
        <div
          className="mt-2 h-5 rounded-md w-full"
          style={{ background: `linear-gradient(135deg, ${localFrom}, ${localTo})` }}
        />
      </PopoverContent>
    </Popover>
  )
}
