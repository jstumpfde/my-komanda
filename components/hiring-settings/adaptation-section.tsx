"use client"

import { useState } from "react"
import { Bell, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CompanyHiringDefaults } from "@/lib/db/schema"

// Раздел «Адаптация» в настройках HR: автоматический сбор обратной связи (опросы
// 30/60/90). Перенесён сюда из таба «Воронка» (по просьбе Юрия). Данные —
// companies.hiring_defaults_json.feedbackSurveys (company-level, как и было).
export function AdaptationSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const [feedbackEnabled, setFeedbackEnabled] = useState(defaults.feedbackSurveys?.enabled ?? false)
  const [feedback30, setFeedback30] = useState(defaults.feedbackSurveys?.d30 ?? true)
  const [feedback60, setFeedback60] = useState(defaults.feedbackSurveys?.d60 ?? true)
  const [feedback90, setFeedback90] = useState(defaults.feedbackSurveys?.d90 ?? true)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onPatch({
        feedbackSurveys: { enabled: feedbackEnabled, d30: feedback30, d60: feedback60, d90: feedback90 },
      })
      toast.success("Настройки адаптации сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Автоматический сбор обратной связи
        </CardTitle>
        <CardDescription>
          Опросы новых сотрудников на контрольных точках адаптации. Дефолт
          компании — отправляются модулем «Адаптация» после найма.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm">Включить автоматические опросы</p>
          <Switch checked={feedbackEnabled} onCheckedChange={setFeedbackEnabled} />
        </div>
        <div className={cn("space-y-2 pl-4 border-l-2 border-primary/20", !feedbackEnabled && "opacity-50 pointer-events-none")}>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={feedback30} onCheckedChange={(v) => setFeedback30(!!v)} />
            30 дней — «Как проходит адаптация?»
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={feedback60} onCheckedChange={(v) => setFeedback60(!!v)} />
            60 дней — «Чувствуете ли уверенность?»
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={feedback90} onCheckedChange={(v) => setFeedback90(!!v)} />
            90 дней — «Оправдались ли ожидания?»
          </label>
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="size-3.5" />
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
