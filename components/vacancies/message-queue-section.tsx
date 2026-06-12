"use client"

import { useCallback, useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, PauseCircle, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"

interface QueueData {
  paused: boolean
  pendingCount: number
  pendingByBranch: Record<string, number>
  pendingRejections: number
}

// Русские названия веток дожима
const BRANCH_LABELS: Record<string, string> = {
  not_opened:               "Не открыл демо",
  opened_not_finished:      "Открыл, не дошёл",
  anketa_confirmation:      "Подтверждение анкеты",
  anketa_auto_reply:        "Автоответ анкеты",
  first_msg_2:              "Сообщение 2",
  first_msg_3:              "Сообщение 3",
  first_msg_offhours:       "Внерабочий отклик",
  test_after_message:       "После теста",
  test_invite:              "Приглашение на тест",
  test_reminder:            "Напоминание о тесте",
  test_not_opened:          "Тест не открыт",
  test_opened_not_submitted:"Тест не отправлен",
  schedule_invite:          "Приглашение на интервью",
}

function branchLabel(branch: string): string {
  return BRANCH_LABELS[branch] ?? branch
}

interface Props {
  vacancyId: string
}

export function MessageQueueSection({ vacancyId }: Props) {
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue`)
      if (!res.ok) throw new Error("Ошибка загрузки")
      const json = await res.json()
      setData(json.data ?? json)
    } catch {
      toast.error("Не удалось загрузить данные очереди")
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handlePauseToggle(paused: boolean) {
    if (!data) return
    setPauseLoading(true)
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/message-queue/pause`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused }),
        },
      )
      if (!res.ok) throw new Error("Ошибка")
      setData((prev) => prev ? { ...prev, paused } : prev)
      toast.success(paused ? "Отправки приостановлены" : "Отправки возобновлены")
    } catch {
      toast.error("Не удалось изменить статус")
    } finally {
      setPauseLoading(false)
    }
  }

  async function handleClear() {
    setClearLoading(true)
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/message-queue/clear`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "all" }),
        },
      )
      if (!res.ok) throw new Error("Ошибка")
      const json = await res.json()
      const result = json.data ?? json
      toast.success(
        `Очищено: ${result.cancelledFollowups} сообщений, ${result.cancelledRejections} отказов`,
      )
      setClearDialogOpen(false)
      // Обновляем счётчики
      await fetchData()
    } catch {
      toast.error("Не удалось очистить очередь")
    } finally {
      setClearLoading(false)
    }
  }

  const totalPending = (data?.pendingCount ?? 0) + (data?.pendingRejections ?? 0)

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <PauseCircle className="w-4 h-4 text-muted-foreground" />
            Очередь сообщений
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Дожимы, приглашения и уведомления, запланированные для этой вакансии
          </p>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <Badge
            variant={totalPending > 0 ? "secondary" : "outline"}
            className="text-xs shrink-0"
          >
            {totalPending} в очереди
          </Badge>
        )}
      </div>

      {/* Тумблер паузы */}
      <div className="flex items-center gap-3">
        {pauseLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            id="outbound-paused"
            checked={data?.paused ?? false}
            onCheckedChange={handlePauseToggle}
            disabled={loading || pauseLoading}
          />
        )}
        <Label htmlFor="outbound-paused" className="text-sm cursor-pointer select-none">
          {data?.paused
            ? "Отправки приостановлены — сообщения накапливаются, не уходят"
            : "Отправки идут в штатном режиме"}
        </Label>
      </div>

      {/* Разбивка по типам */}
      {data && (data.pendingCount > 0 || data.pendingRejections > 0) && (
        <div className="space-y-1.5">
          {data.pendingRejections > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Отложенные отказы</span>
              <Badge variant="outline" className="text-xs h-5">{data.pendingRejections}</Badge>
            </div>
          )}
          {Object.entries(data.pendingByBranch).map(([branch, cnt]) => (
            <div key={branch} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{branchLabel(branch)}</span>
              <Badge variant="outline" className="text-xs h-5">{cnt}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Кнопка очистки */}
      {data && totalPending > 0 && (
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs text-destructive border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            onClick={() => setClearDialogOpen(true)}
            disabled={clearLoading}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Очистить очередь
          </Button>
        </div>
      )}

      {/* Диалог подтверждения очистки */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить очередь?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет отменено {totalPending} сообщений
              {data?.pendingRejections ? ` (включая ${data.pendingRejections} отложенных отказов)` : ""}.
              Это действие нельзя отменить. Уже отправленные сообщения не затрагиваются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearLoading}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              disabled={clearLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearLoading ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Очищаю…</>
              ) : (
                "Отменить сообщения"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
