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
  showScore: boolean          // колонка «AI-оцен.» (оценка анкеты)
  showResumeScore?: boolean   // колонка «AI-резм.» (скоринг резюме); undefined = показывать
  showPortraitScore?: boolean // колонка «AI-Порт» (оценка по Портрету, ai_score_v2); undefined = показывать
  showAnswersScore?: boolean  // колонка «Демо1» (AI-оценка ответов анкеты, ai_score); undefined = показывать
  showTestScore?: boolean     // колонка «Тест» (балл/статус теста); undefined = показывать
  showNextInterview?: boolean // колонка «Интервью» (ближайшее); undefined = показывать
  showAge: boolean
  showSource: boolean
  showCity: boolean
  showExperience: boolean
  showSkills: boolean
  showActions: boolean
  showProgress?: boolean
  showResponseDate?: boolean
  showNameWarning?: boolean   // бэйдж ⚠ «имя под вопросом» у имени; undefined = показывать
}

// ЕДИНЫЙ реестр тумблеров колонок СПИСКА кандидатов — источник правды для панели
// «Вид» (view-settings.tsx). Порядок ДОЛЖЕН совпадать с порядком колонок в
// list-view.tsx (слева→направо). Системные колонки (★ Избранное, Кандидат/ФИО,
// Статус) сюда НЕ входят — они всегда видны. Добавил колонку с новым ключом в
// list-view — добавь сюда строку, и тумблер появится автоматически (и наоборот).
// Порядок строго совпадает с порядком колонок в list-view.tsx (слева→направо):
// AI-резм. → Демо → Демо1 → AI-Порт → AI-оцен. → Тест → Интервью → Зарплата → …
export const CANDIDATE_COLUMN_TOGGLES: Array<{ key: keyof CardDisplaySettings; label: string }> = [
  { key: "showResumeScore",   label: "AI резюме" },
  { key: "showProgress",      label: "Прогресс демо" },
  { key: "showAnswersScore",  label: "AI-ан (балл ответов демо)" },
  { key: "showPortraitScore", label: "AI-Портрет" },
  { key: "showScore",         label: "AI оценка" },
  { key: "showTestScore",     label: "Тест" },
  { key: "showNextInterview", label: "Интервью" },
  { key: "showSalaryFull",    label: "Зарплата" },
  { key: "showCity",          label: "Город" },
  { key: "showResponseDate",  label: "Дата отклика" },
  { key: "showSource",        label: "Источник" },
  { key: "showActions",       label: "Кнопки действий" },
]

interface CardSettingsProps {
  settings: CardDisplaySettings
  onSettingsChange: (settings: CardDisplaySettings) => void
}

const settingsLabels: { key: keyof CardDisplaySettings; label: string }[] = [
  { key: "showScore", label: "AI скоринг" },
  { key: "showSalaryFull", label: "Зарплата" },
  { key: "showCity", label: "Город" },

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
