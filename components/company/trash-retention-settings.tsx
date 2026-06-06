"use client"

// Per-company «Корзина — срок хранения»: через сколько дней вакансии из корзины
// удаляются навсегда. GET/PATCH /api/modules/hr/company/trash-retention.
// См. cron app/api/cron/trash-cleanup.

import { useEffect, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const OPTIONS = [1, 3, 7, 14, 30, 60, 90] as const
const DEFAULT_DAYS = 30

function dayNoun(days: number): string {
  const mod10 = days % 10
  const mod100 = days % 100
  if (mod10 === 1 && mod100 !== 11) return "день"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня"
  return "дней"
}

export function TrashRetentionSettings() {
  const [days, setDays] = useState<number>(DEFAULT_DAYS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/company/trash-retention")
      .then(r => r.ok ? r.json() : null)
      .then((d: { retentionDays?: number } | null) => {
        if (typeof d?.retentionDays === "number") setDays(d.retentionDays)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/company/trash-retention", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ retentionDays: days }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || "save_failed")
      }
      toast.success("Срок хранения корзины сохранён")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          Корзина — срок хранения
        </CardTitle>
        <CardDescription>
          Через сколько дней вакансии из корзины удаляются навсегда.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="trash-retention" className="text-sm">
            Срок хранения в корзине
          </Label>
          <Select
            value={String(days)}
            onValueChange={(v) => setDays(Number(v))}
            disabled={!loaded}
          >
            <SelectTrigger id="trash-retention" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPTIONS.map(d => (
                <SelectItem key={d} value={String(d)} className="text-sm">
                  {d} {dayNoun(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Alert>
          <AlertDescription className="text-[11px] leading-relaxed">
            Вакансии в корзине удаляются автоматически по истечении срока вместе
            с привязанными к ним кандидатами и сообщениями. До удаления их можно
            восстановить из вкладки «Корзина».
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !loaded}
            className="gap-1.5 h-8 text-xs"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
