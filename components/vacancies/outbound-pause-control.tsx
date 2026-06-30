"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Loader2, PauseCircle, PlayCircle } from "lucide-react"
import { toast } from "sonner"

interface Props {
  vacancyId: string
  /** Необязательный колбэк — дёрнуть после смены статуса (например, перечитать секцию очереди). */
  onChanged?: (paused: boolean) => void
}

/**
 * Заметная кнопка-переключатель «Пауза дожимов» / «Возобновить» в шапке вакансии.
 *
 * Использует существующий контракт очереди сообщений:
 *   GET  /api/modules/hr/vacancies/[id]/message-queue        → { paused, ... }
 *   POST /api/modules/hr/vacancies/[id]/message-queue/pause  Body { paused: boolean }
 *
 * Пауза останавливает только исходящие дожимы/приглашения (cron follow-up их
 * пропускает). Разбор новых откликов (process-queue) паузу НЕ читает и работает.
 */
export function OutboundPauseControl({ vacancyId, onChanged }: Props) {
  const [paused, setPaused] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue`)
      if (!res.ok) return
      const json = await res.json()
      const data = json.data ?? json
      if (typeof data?.paused === "boolean") setPaused(data.paused)
    } catch {
      /* тихо — кнопка просто не появится */
    }
  }, [vacancyId])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  async function toggle() {
    if (paused === null || saving) return
    const next = !paused
    setSaving(true)
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/message-queue/pause`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused: next }),
        },
      )
      if (!res.ok) throw new Error("Ошибка")
      setPaused(next)
      toast.success(next ? "Дожимы поставлены на паузу" : "Дожимы возобновлены")
      onChanged?.(next)
    } catch {
      toast.error("Не удалось изменить статус дожимов")
    } finally {
      setSaving(false)
    }
  }

  // Пока статус не загружен — не показываем (избегаем мигания).
  if (paused === null) return null

  const tip = "Останавливает дожимы. Разбор новых откликов не трогает."

  return (
    <div className="flex items-center gap-2">
      {paused && (
        <Badge
          variant="outline"
          className="h-8 gap-1.5 border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
        >
          <PauseCircle className="size-3.5" />
          Дожимы на паузе
        </Badge>
      )}
      <UITooltip>
        <TooltipTrigger asChild>
          <Button
            variant={paused ? "default" : "outline"}
            size="sm"
            className={
              paused
                ? "h-8 gap-1.5 text-xs"
                : "h-8 gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/30"
            }
            onClick={toggle}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : paused ? (
              <PlayCircle className="size-3.5" />
            ) : (
              <PauseCircle className="size-3.5" />
            )}
            {paused ? "Возобновить дожимы" : "Пауза дожимов"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </UITooltip>
    </div>
  )
}
