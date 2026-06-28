"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import {
  Play, Square, Loader2, Settings2, Shield, Gauge, Info, RefreshCw,
} from "lucide-react"

interface EnqueueResponse {
  jobId:  string
  status: "queued"
  error?: string
}

interface JobStatusResponse {
  jobId:     string
  status:    "queued" | "running" | "completed" | "failed" | "stopped"
  processed: number
  invited:   number
  rejected:  number
  kept:      number
  error?:    string | null
}

const POLL_INTERVAL_MS = 2000

interface HhAutoProcessProps {
  vacancyId?: string
  pendingCount?: number
  onProcessed?: () => void
  /** Синк hh БЕЗ разбора. Если задан — в поповере появляется кнопка
   *  «Синхронизировать» (сверху): синк → затем разбор по текущим настройкам. */
  onSync?: () => Promise<void>
  /** Внешний флаг идущего синка (для спиннера на кнопке). */
  syncing?: boolean
  /** Подпись «синх. N мин назад» — показывается рядом с кнопкой синхронизации. */
  lastSyncLabel?: string
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
  onProcessed,
  onSync,
  syncing = false,
  lastSyncLabel,
  variant = "inline",
}: HhAutoProcessProps) {
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [open, setOpen] = useState(false)

  const [limit, setLimit] = useState<number | "all">(5)
  const [speed, setSpeed] = useState<SpeedPreset>("safe")
  const [manualMode, setManualMode] = useState<boolean>(false)

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
      const payload = {
        vacancyId,
        limit:        Number.isFinite(Number(effectiveLimit)) ? Number(effectiveLimit) : 5,
        delaySeconds: Number.isFinite(Number(delaySeconds))   ? Number(delaySeconds)   : 30,
      }
      // 1. Enqueue. Бэкенд возвращает {jobId, status:queued} мгновенно
      //   (<500мс), реальный разбор идёт в фоне.
      const res = await fetch("/api/integrations/hh/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const enq = await res.json() as EnqueueResponse
      if (!res.ok || !enq.jobId) throw new Error(enq.error || "Не удалось поставить задачу в очередь")

      toast("🔄 Разбор запущен в фоне…", { duration: 2000 })

      // 2. Polling — раз в 2 сек до завершения. Не блокирует UI.
      const finalStatus = await waitForJob(enq.jobId)

      const dur = Math.round((Date.now() - startedAt) / 1000)
      const summary = [
        `Обработано: ${finalStatus.processed}`,
        finalStatus.invited > 0 ? `приглашено: ${finalStatus.invited}` : null,
        finalStatus.rejected > 0 ? `отказ: ${finalStatus.rejected}` : null,
        finalStatus.kept > 0 ? `в «Новый»: ${finalStatus.kept}` : null,
      ].filter(Boolean).join(", ")

      if (finalStatus.status === "failed") {
        toast.error(finalStatus.error || "Разбор завершился с ошибкой")
      } else if (finalStatus.status === "stopped") {
        toast(`🛑 Разбор остановлен. ${summary}`)
      } else if (finalStatus.processed === 0) {
        toast.info("Нет новых откликов для разбора")
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

  // Polling статуса до перехода в terminal-состояние.
  // Терпит сетевые сбои (просто пытается дальше), сдаётся через ~30 мин.
  const waitForJob = async (jobId: string): Promise<JobStatusResponse> => {
    const startedAt = Date.now()
    const MAX_WAIT_MS = 30 * 60 * 1000 // 30 минут абсолютный таймаут
    while (Date.now() - startedAt < MAX_WAIT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      try {
        const r = await fetch(`/api/integrations/hh/process-queue/status?jobId=${jobId}`)
        if (!r.ok) continue
        const data = await r.json() as JobStatusResponse
        if (data.status === "completed" || data.status === "failed" || data.status === "stopped") {
          return data
        }
      } catch {
        // молча — сеть может ребутнуться, продолжаем polling
      }
    }
    throw new Error("Превышен таймаут ожидания разбора (30 минут)")
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

  // #16: «Синхронизировать» в поповере — сначала синк (onSync), затем разбор
  // по ТЕКУЩИМ настройкам поповера (скорость/лимит/ручной-авто) = «по сценарию».
  const syncAndRun = async () => {
    if (!onSync) return
    setOpen(false)
    try { await onSync() } catch { return }
    await run()
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

      {/* P0-52: Тумблер «Использовать минимальный AI-скор» и слайдер «Порог
          приглашения» удалены. Источник истины — таб «Воронка» вакансии
          (vacancy_ai_settings.minScoreLower/Upper). Раньше payload.minScore
          в любом случае игнорировался бэкендом — но UI запутывал HR'ов и
          провоцировал баги уровня P0-53 (старый порог 70 + новый 50 →
          50 кандидатов с auto_processing_stopped=true). */}

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
            {/* S2: «Синхронизировать» вынесена из ⚙️-поповера на видное место —
                только синк (подтянуть новые отклики), без авто-разбора. */}
            {onSync && (
              <Button
                onClick={() => { onSync() }}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                title={lastSyncLabel
                  ? `Подтянуть отклики с hh.ru (без отправки сообщений кандидатам) · ${lastSyncLabel}`
                  : "Подтянуть отклики с hh.ru (без отправки сообщений кандидатам)"}
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Синхр.
              </Button>
            )}
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
                {onSync && (
                  <>
                    <div className="flex items-center gap-2 mb-3 min-w-0">
                      <Button
                        onClick={syncAndRun}
                        disabled={syncing || running}
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 shrink-0"
                        title="Подтянуть отклики с hh.ru, затем разобрать по этим настройкам"
                      >
                        {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Синхронизировать и разобрать
                      </Button>
                      {lastSyncLabel && (
                        <span className="text-[11px] text-muted-foreground truncate">{lastSyncLabel}</span>
                      )}
                    </div>
                    <div className="border-t -mx-4 mb-3" />
                  </>
                )}
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
          AI оценит резюме под вакансию. Пороги настраиваются в табе «Воронка» вакансии.
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
