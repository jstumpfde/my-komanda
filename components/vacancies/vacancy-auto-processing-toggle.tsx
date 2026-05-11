"use client"

// Маленький отдельный компонент — переключатель «Авто-разбор откликов с hh.ru».
// Раньше был частью VacancyScheduleSettings, в Ф4 вынесен в таб «Источники»
// (где логически и должен быть — это режим обработки hh-источника, а не расписание).
// Сохраняется через тот же PATCH /api/modules/hr/vacancies/[id]/schedule-settings —
// он принимает любое подмножество полей.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Sparkles } from "lucide-react"

export interface VacancyAutoProcessingToggleProps {
  vacancyId: string
}

export function VacancyAutoProcessingToggle({ vacancyId }: VacancyAutoProcessingToggleProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-settings`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ autoProcessingEnabled?: boolean }>
      })
      .then((d) => { if (!cancelled) setEnabled(Boolean(d.autoProcessingEnabled)) })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  const handleToggle = async (next: boolean) => {
    const prev = enabled
    setEnabled(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoProcessingEnabled: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(next ? "Авто-разбор включён" : "Авто-разбор выключен", { duration: 1500 })
    } catch {
      setEnabled(prev)
      toast.error("Не удалось сохранить авто-разбор")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Авто-разбор откликов с hh.ru
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Cron каждые 10 минут разбирает новые отклики</Label>
            <p className="text-xs text-muted-foreground">
              Работает только в рабочее время (см. таб «Расписание»). Если выключено —
              нужно нажимать «Разобрать всё» вручную в списке откликов.
            </p>
          </div>
          <Switch
            checked={Boolean(enabled)}
            onCheckedChange={handleToggle}
            disabled={enabled === null || saving}
          />
        </div>
      </CardContent>
    </Card>
  )
}
