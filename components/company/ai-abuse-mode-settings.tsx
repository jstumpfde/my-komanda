"use client"

// Группа 36: per-company настройка строгости AI чат-бота при работе
// с неуважительным общением. GET/PUT /api/modules/hr/company/ai-abuse-mode.

import { useEffect, useState } from "react"
import { Loader2, Save, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

type AbuseMode = "strict" | "lenient"

export function AiAbuseModeSettings() {
  const [mode, setMode] = useState<AbuseMode>("strict")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/company/ai-abuse-mode")
      .then(r => r.ok ? r.json() : null)
      .then((d: { mode?: AbuseMode } | null) => {
        if (d?.mode === "lenient") setMode("lenient")
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/company/ai-abuse-mode", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || "save_failed")
      }
      toast.success("Режим строгости сохранён")
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
          <ShieldAlert className="w-4 h-4" />
          Режим строгости общения
        </CardTitle>
        <CardDescription>
          Что делает AI чат-бот, если кандидат пишет мат или прямые оскорбления.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as AbuseMode)}
          className="space-y-2"
        >
          <div className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
            <RadioGroupItem value="strict" id="abuse-strict" className="mt-0.5" disabled={!loaded} />
            <Label htmlFor="abuse-strict" className="text-sm font-normal cursor-pointer flex-1">
              <span className="font-medium">Строго</span> (по умолчанию)
              <p className="text-[11px] text-muted-foreground mt-0.5">
                При мате — автоотказ и сообщение «Мы прекращаем общение». Кандидат
                переводится в стадию «Отказ».
              </p>
            </Label>
          </div>
          <div className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
            <RadioGroupItem value="lenient" id="abuse-lenient" className="mt-0.5" disabled={!loaded} />
            <Label htmlFor="abuse-lenient" className="text-sm font-normal cursor-pointer flex-1">
              <span className="font-medium">Мягко</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                При мате — спокойное предупреждение «Прошу общаться корректно», диалог
                продолжается. На 2-м повторе (любого уровня грубости) — отказ.
              </p>
            </Label>
          </div>
        </RadioGroup>

        <Alert>
          <AlertDescription className="text-[11px] leading-relaxed">
            Попытки перепрограммировать AI (injection) всегда обрабатываются как автоотказ —
            это безопасность, а не тон общения, и режим строгости на них не влияет.
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
