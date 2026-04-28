"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SlidersHorizontal } from "lucide-react"

export interface CardDisplaySettings {
  showSalary: boolean
  showSalaryFull: boolean
  showScore: boolean
  showAge: boolean
  showSource: boolean
  showCity: boolean
  showExperience: boolean
  showSkills: boolean
  showActions: boolean
  showProgress?: boolean
  showResponseDate?: boolean
}

interface CardSettingsProps {
  settings: CardDisplaySettings
  onSettingsChange: (settings: CardDisplaySettings) => void
}

const settingsLabels: { key: keyof CardDisplaySettings; label: string }[] = [
  { key: "showScore", label: "AI скоринг" },
  { key: "showSalary", label: "Зарплата (кратко)" },
  { key: "showSalaryFull", label: "Зарплата (полностью)" },
  { key: "showCity", label: "Город" },
  { key: "showExperience", label: "Опыт работы" },
  { key: "showSkills", label: "Ключевые навыки" },
  { key: "showAge", label: "Возраст" },
  { key: "showSource", label: "Источник" },
  { key: "showActions", label: "Кнопки действий" },
]

export function CardSettings({ settings, onSettingsChange }: CardSettingsProps) {
  const handleToggle = (key: keyof CardDisplaySettings) => {
    const newSettings = { ...settings, [key]: !settings[key] }
    
    // Logic: if full salary is enabled, disable short salary
    if (key === "showSalaryFull" && newSettings.showSalaryFull) {
      newSettings.showSalary = false
    }
    if (key === "showSalary" && newSettings.showSalary) {
      newSettings.showSalaryFull = false
    }
    
    onSettingsChange(newSettings)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <SlidersHorizontal className="size-4 mr-2" />
          Вид карточки
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">Настройки карточки</h4>
            <p className="text-xs text-muted-foreground">
              Выберите что отображать
            </p>
          </div>
          <div className="space-y-3">
            {settingsLabels.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key} className="text-sm font-normal cursor-pointer">
                  {label}
                </Label>
                <Switch
                  id={key}
                  checked={settings[key]}
                  onCheckedChange={() => handleToggle(key)}
                />
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
