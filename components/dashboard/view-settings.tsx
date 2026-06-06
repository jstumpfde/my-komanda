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
import { useAuth } from "@/lib/auth"
import type { CardDisplaySettings } from "./card-settings"
import type { ViewMode } from "./kanban-board"

interface ViewSettingsProps {
  settings: CardDisplaySettings
  onSettingsChange: (settings: CardDisplaySettings) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  /** Если задан — в меню появляется пункт «Тест» (таблица ответов на отдельной странице). */
  testTableHref?: string
}

const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "funnel", label: "Воронка" },
  { value: "list",   label: "Список"  },
  { value: "kanban", label: "Канбан"  },
  { value: "tiles",  label: "Плитки"  },
]

// Порядок повторяет колонки списка (list-view.tsx): после «Кандидат» идут
// Демо(прогресс) → AI-резм. → AI-оцен. → Зарплата → Город → Дата → Источник →
// Действия. Тумблеры выстроены в том же порядке.
const DISPLAY_TOGGLES: Array<{ key: keyof CardDisplaySettings; label: string }> = [
  { key: "showProgress",      label: "Прогресс демо" },
  { key: "showResumeScore",   label: "AI резюме" },
  { key: "showScore",         label: "AI оценка" },
  { key: "showTestScore",     label: "Тест" },
  { key: "showSalaryFull",    label: "Зарплата" },
  { key: "showCity",          label: "Город" },
  { key: "showResponseDate",  label: "Дата отклика" },
  { key: "showSource",        label: "Источник" },
  { key: "showActions",       label: "Кнопки действий" },
]

export function ViewSettings({ settings, onSettingsChange, viewMode, onViewModeChange, testTableHref }: ViewSettingsProps) {
  const { role } = useAuth()
  // Все режимы (Воронка/Канбан/Плитки) — только у администратора платформы.
  // Все остальные (менеджер платформы + клиентские роли) видят только «Список».
  const showAllViews = role === "platform_admin"

  const handleToggle = (key: keyof CardDisplaySettings) => {
    // undefined трактуем как «включено» (см. checked выше), поэтому переключаем
    // от отображаемого состояния: false → true, иначе → false.
    const next = { ...settings, [key]: settings[key] === false }
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
      <PopoverContent
        className="w-72 max-h-[min(85vh,var(--radix-popover-content-available-height))] overflow-y-auto"
        align="end"
      >
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
              {testTableHref && (
                <>
                  <div className="my-1 border-t" />
                  <a
                    href={testTableHref}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/60"
                  >
                    <span className="flex-1">Тест — ответы кандидатов</span>
                    <span className="text-[10px] text-muted-foreground">таблица →</span>
                  </a>
                </>
              )}
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
                    checked={settings[key] !== false}
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
