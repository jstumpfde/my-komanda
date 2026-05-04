"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Eye, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth, isPlatformRole } from "@/lib/auth"
import type { CardDisplaySettings } from "./card-settings"
import type { ViewMode } from "./kanban-board"

interface ViewSettingsProps {
  settings: CardDisplaySettings
  onSettingsChange: (settings: CardDisplaySettings) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "funnel", label: "Воронка" },
  { value: "list",   label: "Список"  },
  { value: "kanban", label: "Канбан"  },
  { value: "tiles",  label: "Плитки"  },
]

const DISPLAY_TOGGLES: Array<{ key: keyof CardDisplaySettings; label: string }> = [
  { key: "showScore",         label: "AI скоринг" },
  { key: "showProgress",      label: "Прогресс % демо" },
  { key: "showResponseDate",  label: "Дата отклика" },
  { key: "showSalaryFull",    label: "Зарплата (полностью)" },
  { key: "showSalary",        label: "Зарплата (кратко)" },
  { key: "showCity",          label: "Город" },
  { key: "showExperience",    label: "Опыт работы" },
  { key: "showSkills",        label: "Ключевые навыки" },
  { key: "showAge",           label: "Возраст" },
  { key: "showSource",        label: "Источник" },
  { key: "showActions",       label: "Кнопки действий" },
]

export function ViewSettings({ settings, onSettingsChange, viewMode, onViewModeChange }: ViewSettingsProps) {
  const { role } = useAuth()
  const showAllViews = isPlatformRole(role)

  const handleToggle = (key: keyof CardDisplaySettings) => {
    const next = { ...settings, [key]: !settings[key] }
    if (key === "showSalaryFull" && next.showSalaryFull) next.showSalary = false
    if (key === "showSalary" && next.showSalary) next.showSalaryFull = false
    onSettingsChange(next)
  }

  const activeLabel = VIEW_MODES.find((m) => m.value === viewMode)?.label

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <Eye className="w-3.5 h-3.5" />
          {activeLabel ? `Вид: ${activeLabel}` : "Вид"}
          <ChevronDown className="w-3 h-3 ml-0.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Режим отображения</h4>
            <div className="space-y-1">
              {VIEW_MODES.filter(({ value }) => value === "list" || showAllViews).map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/60",
                    viewMode === value && "bg-muted"
                  )}
                >
                  <input
                    type="radio"
                    name="view-mode"
                    checked={viewMode === value}
                    onChange={() => onViewModeChange(value)}
                    className="accent-primary w-3.5 h-3.5"
                  />
                  <span className="flex-1">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="border-t pt-3 space-y-3">
            <h4 className="font-medium text-sm">Настройки отображения</h4>
            <div className="space-y-2.5">
              {DISPLAY_TOGGLES.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`vs-${key}`} className="text-sm font-normal cursor-pointer">{label}</Label>
                  <Switch
                    id={`vs-${key}`}
                    checked={!!settings[key]}
                    onCheckedChange={() => handleToggle(key)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
