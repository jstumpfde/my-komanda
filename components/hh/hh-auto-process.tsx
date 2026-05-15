"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import {
  Play, Square, Loader2, Settings2, Shield, Gauge, AlertTriangle, Info,
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

type SpeedPreset = "safe" | "standard"
const SPEED_OPTIONS: Array<{ value: SpeedPreset; seconds: number; label: string; icon: typeof Shield }> = [
  { value: "safe",     seconds: 60, label: "Безопасно (1 мин / кандидат)", icon: Shield },
  { value: "standard", seconds: 30, label: "Стандарт (30 сек)",            icon: Gauge },
]

const LIMIT_OPTIONS: Array<number | "all"> = [5, 10, 25, 50, "all"]
const LIMIT_FALLBACK_MAX = 8

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

  const [limit, setLimit] = useState<number | "all">(5)
  const [speed, setSpeed] = useState<SpeedPreset>("safe")
  const [useMinScore, setUseMinScore] = useState<boolean>(false)
  const [manualMode, setManualMode] = useState<boolean>(false)
  const [minScore, setMinScore] = useState<number>(defaultMinScore)

  const [autoProcessingEnabled, setAutoProcessingEnabled] = useState<boolean | null>(null)
  const [autoProcessingSaving, setAutoProcessingSaving] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-settings`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ autoProcessingEnabled?: boolean }>
      })
      .then((d) => { if (!cancelled) setAutoProcessingEnabled(Boolean(d.autoProcessingEnabled)) })
      .catch(() => { /* молча — тумблер просто будет неактивен */ })
    return () => { cancelled = true }
  }, [vacancyId])

  const toggleAutoProcessing = async (next: boolean) => {
    if (!vacancyId) return
    const prev = autoProcessingEnabled
    setAutoProcessingEnabled(next)
    setAutoProcessingSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/schedule-settings`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ autoProcessingEnabled: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { autoProcessingEnabled?: boolean }
      setAutoProcessingEnabled(Boolean(data.autoProcessingEnabled))
      toast.success(next ? "Авто-разбор включён" : "Авто-разбор выключен")
    } catch (e) {
      setAutoProcessingEnabled(prev)
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setAutoProcessingSaving(false)
    }
  }

  const delaySeconds = useMemo(
    () => SPEED_OPTIONS.find(o => o.value === speed)?.seconds ?? 30,
    [speed],
  )

  const isAll = limit === "all"
  // В ручном режиме — пользовательский выбор количества. В автоматическом
  // (default) — дефолт 5 кандидатов, блок выбора скрыт.
  const effectiveLimit = !manualMode
    ? 5
    : isAll
      ? (pendingCount && pendingCount > 0 ? pendingCount : LIMIT_FALLBACK_MAX)
      : limit
  const estimatedMinutes = Math.max(1, Math.ceil((effectiveLimit * delaySeconds) / 60))

  const run = async () => {
    setRunning(true)
    setOpen(false)
    const startedAt = Date.now()
    try {
      // Защита от рассинхронизации типов после ввода через UI:
      // Number() гарантирует, что limit/delaySeconds/minScore — это всегда
      // конечные числа (без NaN), даже если state пришёл из URL/localStorage
      // как строка.
      const payload = {
        vacancyId,
        limit:        Number.isFinite(Number(effectiveLimit)) ? Number(effectiveLimit) : 5,
        delaySeconds: Number.isFinite(Number(delaySeconds))   ? Number(delaySeconds)   : 30,
        minScore:     useMinScore ? (Number.isFinite(Number(minScore)) ? Number(minScore) : 70) : 0,
      }
      const res = await fetch("/api/integrations/hh/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      } else {
        toast.success(`Разбор завершён: ${summary} (${dur}с)`)
      }
      onProcessed?.()
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

  const labelButton = (() => {
    if (isAll) {
      return pendingCount != null && pendingCount > 0
        ? `Разобрать всё (${pendingCount})`
        : "Разобрать всё"
    }
    return pendingCount != null && pendingCount > 0
      ? `Разобрать ${pendingCount > limit ? limit : pendingCount}`
      : `Разобрать ${limit}`
  })()

  const settingsContent = (
    <div className="space-y-4">
      {/* Тумблер ручного режима. ВЫКЛ (default) — разбор стартует с
          дефолтом 5 кандидатов, блок выбора количества скрыт.
          ВКЛ — показывается выбор 5/10/25/50/Все. */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Ручной разбор</Label>
        <Switch checked={manualMode} onCheckedChange={setManualMode} />
      </div>
      {manualMode && (
        <div>
          <Label className="text-xs font-medium mb-1.5 block">Сколько обработать</Label>
          <div className="flex gap-1.5">
            {LIMIT_OPTIONS.map(n => (
              <Button
                key={String(n)}
                size="sm"
                variant={limit === n ? "default" : "outline"}
                className="h-7 text-xs px-3 flex-1"
                onClick={() => setLimit(n)}
              >
                {n === "all" ? "Все" : n}
              </Button>
            ))}
          </div>
        </div>
      )}

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

      {vacancyId && (
        <div className="border rounded px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Label className="text-xs font-medium block">
                Авто-разбор: {autoProcessingEnabled ? "ВКЛ" : "ВЫКЛ"}
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Cron каждые 10 минут — в рабочее время
              </p>
            </div>
            <Switch
              checked={Boolean(autoProcessingEnabled)}
              disabled={autoProcessingEnabled === null || autoProcessingSaving}
              onCheckedChange={toggleAutoProcessing}
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs font-medium">Использовать минимальный AI-скор</Label>
          <Switch checked={useMinScore} onCheckedChange={setUseMinScore} />
        </div>
        {useMinScore && (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Порог приглашения</Label>
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
          </>
        )}
      </div>

      {isAll ? (
        <div className="flex items-start gap-2 rounded border border-red-300 bg-red-50 px-2.5 py-2 text-[11px] leading-snug text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Будет отправлено сообщений: <strong>{effectiveLimit}</strong>
          </span>
        </div>
      ) : null}

      <div className="text-[11px] text-muted-foreground border-t pt-2">
        Расчётное время: ~{estimatedMinutes} мин ({effectiveLimit} × {delaySeconds}с)
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
