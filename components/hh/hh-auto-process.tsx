"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Play, Square, Loader2, Settings2, Zap, Shield, Gauge,
} from "lucide-react"

interface ProcessQueueResponse {
  processed: number
  invited?: number
  rejected?: number
  kept?: number
  message?: string
  error?: string
}

interface HhAutoProcessProps {
  vacancyId?: string
  pendingCount?: number
  defaultMinScore?: number
  onProcessed?: () => void
  /** "inline" — компактная кнопка с поповером (по умолчанию), "card" — большая карточка. */
  variant?: "inline" | "card"
}

type SpeedPreset = "safe" | "standard" | "fast"
const SPEED_OPTIONS: Array<{ value: SpeedPreset; seconds: number; label: string; icon: typeof Shield }> = [
  { value: "safe",     seconds: 30, label: "Безопасно (30 сек / кандидат)", icon: Shield },
  { value: "standard", seconds: 15, label: "Стандарт (15 сек)",             icon: Gauge },
  { value: "fast",     seconds: 5,  label: "Быстро (5 сек, риск 429 от hh)", icon: Zap },
]

const LIMIT_OPTIONS = [5, 10, 25, 50]

export function HhAutoProcess({
  vacancyId,
  pendingCount,
  defaultMinScore = 70,
  onProcessed,
  variant = "inline",
}: HhAutoProcessProps) {
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [open, setOpen] = useState(false)

  const [limit, setLimit] = useState<number>(5)
  const [speed, setSpeed] = useState<SpeedPreset>("safe")
  const [minScore, setMinScore] = useState<number>(defaultMinScore)
  const [dryRun, setDryRun] = useState(false)

  const delaySeconds = useMemo(
    () => SPEED_OPTIONS.find(o => o.value === speed)?.seconds ?? 30,
    [speed],
  )

  const estimatedMinutes = Math.max(1, Math.ceil((limit * delaySeconds) / 60))

  const run = async () => {
    setRunning(true)
    setOpen(false)
    const startedAt = Date.now()
    try {
      const res = await fetch("/api/integrations/hh/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, vacancyId, dryRun, delaySeconds, minScore }),
      })
      const data = await res.json() as ProcessQueueResponse
      if (!res.ok) throw new Error(data.error || "Ошибка")

      const dur = Math.round((Date.now() - startedAt) / 1000)
      const summary = [
        `Обработано: ${data.processed}`,
        data.invited != null ? `приглашено: ${data.invited}` : null,
        data.rejected != null ? `отказ: ${data.rejected}` : null,
        data.kept ? `в «Новый»: ${data.kept}` : null,
      ].filter(Boolean).join(", ")

      if (data.processed === 0) {
        toast.info(data.message || "Нет новых откликов для разбора")
      } else if (dryRun) {
        toast.success(`Тестовый прогон: ${summary} (${dur}с)`)
      } else {
        toast.success(`Разбор завершён: ${summary} (${dur}с)`)
      }
      if (!dryRun) onProcessed?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setRunning(false)
    }
  }

  const stop = async () => {
    setStopping(true)
    try {
      await fetch("/api/integrations/hh/process-queue", { method: "DELETE" })
      toast("🛑 Остановка отправлена")
    } finally {
      setStopping(false)
    }
  }

  const labelButton = pendingCount != null && pendingCount > 0
    ? `Разобрать ${pendingCount > limit ? limit : pendingCount}`
    : `Разобрать ${limit}`

  const settingsContent = (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium mb-1.5 block">Сколько обработать</Label>
        <div className="flex gap-1.5">
          {LIMIT_OPTIONS.map(n => (
            <Button
              key={n}
              size="sm"
              variant={limit === n ? "default" : "outline"}
              className="h-7 text-xs px-3 flex-1"
              onClick={() => setLimit(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium mb-1.5 block">Скорость</Label>
        <div className="space-y-1">
          {SPEED_OPTIONS.map(opt => {
            const Icon = opt.icon
            const active = speed === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSpeed(opt.value)}
                className={`w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded border transition-colors ${
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input bg-background hover:bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs font-medium">Минимальный AI-скор для приглашения</Label>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">{minScore}</Badge>
        </div>
        <Slider
          value={[minScore]}
          min={0}
          max={95}
          step={5}
          onValueChange={v => setMinScore(v[0] ?? 70)}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>0</span>
          <span>95</span>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="dry-run"
          checked={dryRun}
          onCheckedChange={v => setDryRun(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="dry-run" className="text-xs leading-snug cursor-pointer">
          Тестовый прогон (без отправки сообщений в hh)
        </Label>
      </div>

      <div className="text-[11px] text-muted-foreground border-t pt-2">
        Расчётное время: ~{estimatedMinutes} мин ({limit} × {delaySeconds}с)
      </div>
    </div>
  )

  if (variant === "inline") {
    return (
      <div className="inline-flex items-center gap-1">
        {running ? (
          <>
            <Button size="sm" className="h-8 text-xs gap-1.5" disabled>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Идёт обработка…
            </Button>
            <Button
              onClick={stop}
              disabled={stopping}
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              {stopping ? "..." : "Стоп"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={run} size="sm" className="h-8 text-xs gap-1.5">
              <Play className="w-3.5 h-3.5" />
              {labelButton}
            </Button>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  title="Настройки разбора"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4">
                <div className="text-sm font-medium mb-3">Настройки разбора hh-откликов</div>
                {settingsContent}
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    )
  }

  // variant === "card"
  return (
    <div className="border rounded-lg p-4 space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-medium">🤖 Автоматический разбор откликов с hh.ru</h3>
        <p className="text-xs text-muted-foreground mt-1">
          AI оценит резюме под вакансию: при score ≥ {minScore} → приглашение и карточка в канбане.
        </p>
      </div>
      {settingsContent}
      <div className="flex gap-2">
        {running ? (
          <>
            <Button disabled className="flex-1 gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Идёт обработка…
            </Button>
            <Button onClick={stop} disabled={stopping} variant="destructive" className="gap-1.5">
              <Square className="w-3.5 h-3.5" />
              Стоп
            </Button>
          </>
        ) : (
          <Button onClick={run} className="flex-1 gap-1.5">
            <Play className="w-3.5 h-3.5" />
            {labelButton}
          </Button>
        )}
      </div>
    </div>
  )
}
