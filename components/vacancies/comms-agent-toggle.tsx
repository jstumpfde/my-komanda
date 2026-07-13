"use client"

// Фаза 1 «единого центра коммуникаций» (11.07): UI-тумблер пилота «агента
// коммуникаций» — AI переписывает уже отрендеренный текст дожима под контекст
// кандидата, оставаясь в рамках заготовки HR. См.
// lib/comms-agent/adapt-followup-message.ts (гарантии безопасности) и
// vacancy.aiProcessSettings.dozhimAgentEnabled (lib/db/schema.ts). По
// умолчанию ВЫКЛ у всех вакансий — сохраняем через ai-settings PATCH.

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Wand2 } from "lucide-react"

interface Props {
  vacancyId: string
  initialEnabled?: boolean | null
  onSaved?: (enabled: boolean) => void
}

export function CommsAgentToggle({ vacancyId, initialEnabled, onSaved }: Props) {
  const [enabled, setEnabled] = useState(Boolean(initialEnabled))
  const [saving, setSaving] = useState(false)

  const toggle = async (v: boolean) => {
    const prev = enabled
    setEnabled(v)
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dozhimAgentEnabled: v }),
      })
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error || "save_failed")
      toast.success(v ? "Агент коммуникаций включён" : "Агент коммуникаций выключен")
      onSaved?.(v)
    } catch {
      setEnabled(prev)
      toast.error("Не удалось переключить агента коммуникаций")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-600" />
          Агент коммуникаций
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Адаптировать тексты дожимов под кандидата</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              AI-агент адаптирует тексты дожимов под контекст кандидата, не
              меняя ссылок и фактов. Отказы и юридические тексты всегда
              отправляются буквально по шаблону.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
        </div>
      </CardContent>
    </Card>
  )
}
