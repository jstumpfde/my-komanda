"use client"

// Per-company «Безопасность отправки сообщений»: минимальная задержка между
// отправками follow-up касаний в hh-чат. GET/PATCH
// /api/modules/hr/company/send-delay. См. cron app/api/cron/follow-up.

import { useEffect, useState } from "react"
import { Loader2, Save, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const MIN_SECONDS = 21
const MAX_SECONDS = 600
const DEFAULT_SECONDS = 31

export function SendDelaySettings() {
  const [seconds, setSeconds] = useState<number>(DEFAULT_SECONDS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/company/send-delay")
      .then(r => r.ok ? r.json() : null)
      .then((d: { sendDelaySeconds?: number } | null) => {
        if (typeof d?.sendDelaySeconds === "number") setSeconds(d.sendDelaySeconds)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Граница только снизу проверяется при сохранении; в поле разрешаем
  // временно вводить любое число, чтобы не мешать набору (напр. «2» по пути к «21»).
  const belowMin = seconds < MIN_SECONDS
  const aboveMax = seconds > MAX_SECONDS
  const invalid = !Number.isInteger(seconds) || belowMin || aboveMax

  const save = async () => {
    if (invalid) {
      toast.error(`Задержка должна быть в диапазоне ${MIN_SECONDS}–${MAX_SECONDS} секунд`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/company/send-delay", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sendDelaySeconds: seconds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || "save_failed")
      }
      toast.success("Настройка отправки сохранена")
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
          <ShieldCheck className="w-4 h-4" />
          Безопасность отправки сообщений
        </CardTitle>
        <CardDescription>
          Темп отправки автоматических сообщений кандидатам в hh-чат.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="send-delay" className="text-sm">
            Минимальная задержка между отправками сообщений (секунд)
          </Label>
          <Input
            id="send-delay"
            type="number"
            min={MIN_SECONDS}
            max={MAX_SECONDS}
            step={1}
            value={Number.isFinite(seconds) ? seconds : ""}
            disabled={!loaded}
            onChange={(e) => setSeconds(Math.floor(Number(e.target.value)))}
            className="h-9 text-sm"
            aria-invalid={invalid}
          />
          {belowMin && (
            <p className="text-[11px] text-destructive">
              Минимум {MIN_SECONDS} секунд.
            </p>
          )}
          {aboveMax && (
            <p className="text-[11px] text-destructive">
              Максимум {MAX_SECONDS} секунд.
            </p>
          )}
        </div>

        <Alert>
          <AlertDescription className="text-[11px] leading-relaxed">
            Рекомендуем интервал между отправками сообщений — 31 секунда.
            Минимум — 21 секунда. При меньшем значении растёт риск блокировки
            аккаунта hh.ru за подозрительную активность.
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !loaded || invalid}
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
