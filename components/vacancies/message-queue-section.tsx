"use client"

import { useCallback, useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
import { Loader2, PauseCircle, Play, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { MessageQueueJournal } from "@/components/vacancies/message-queue-journal"
import { FollowupPresetsManager } from "@/components/vacancies/followup-presets-manager"
import { VacancyFollowupSettings } from "@/components/vacancies/vacancy-followup-settings"
import { VacancyTestFollowupSettings } from "@/components/vacancies/vacancy-test-followup-settings"
import { QueueSettingsSection } from "@/components/vacancies/queue-settings-section"

interface QueueData {
  paused: boolean
  pendingCount: number
  pendingByBranch: Record<string, number>
  pendingRejections: number
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
  // Меняется при отмене сообщения в журнале — заставляет журнал перечитаться.
  const [journalKey, setJournalKey] = useState(0)

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
      await fetchData()
      setJournalKey((k) => k + 1)
    } catch {
      toast.error("Не удалось очистить очередь")
    } finally {
      setClearLoading(false)
    }
  }

  const totalPending = (data?.pendingCount ?? 0) + (data?.pendingRejections ?? 0)

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* Шапка + статус */}
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

      {/* Журнал (инлайн) + Шаблоны рассылки. Кнопки «Возобновить/Очистить» —
          В ОДНУ СТРОКУ с табами (Юрий 03.07), а не отдельным рядом. */}
      <Tabs defaultValue="journal">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="journal">Журнал</TabsTrigger>
            <TabsTrigger value="templates">Шаблоны рассылки</TabsTrigger>
            <TabsTrigger value="settings">Настройки очереди</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {/* Остановить/возобновить рассылку — рядом с «Очистить очередь» (просьба Юрия) */}
            <Button
              variant="outline"
              size="sm"
              className={
                data?.paused
                  ? "h-8 text-xs text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-600"
                  : "h-8 text-xs text-amber-600 border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-600"
              }
              onClick={() => handlePauseToggle(!(data?.paused ?? false))}
              disabled={loading || pauseLoading}
            >
              {pauseLoading
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : data?.paused
                  ? <Play className="w-3.5 h-3.5 mr-1.5" />
                  : <PauseCircle className="w-3.5 h-3.5 mr-1.5" />}
              {data?.paused ? "Возобновить рассылку" : "Остановить рассылку"}
            </Button>
            {totalPending > 0 && (
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
            )}
          </div>
        </div>

        <TabsContent value="journal" className="mt-3 space-y-3">
          <MessageQueueJournal key={journalKey} vacancyId={vacancyId} onChanged={fetchData} />
        </TabsContent>

        <TabsContent value="templates" className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            Готовые тексты касаний, из которых собирается очередь. Переменные:
            <code className="mx-1">{"{{name}}"}</code>(имя),
            <code className="mx-1">{"{{vacancy}}"}</code>(должность),
            <code className="mx-1">{"{{test_link}}"}</code>,
            <code className="mx-1">{"{{demo_link}}"}</code>. Пустой слот → берётся текст по умолчанию.
          </p>
          <FollowupPresetsManager vacancyId={vacancyId} />
          <VacancyFollowupSettings vacancyId={vacancyId} />
          <VacancyTestFollowupSettings vacancyId={vacancyId} />
        </TabsContent>

        <TabsContent value="settings" className="mt-3">
          {/* #36/#37 Настройки очереди — company-level (окно по типу касания,
              порядок приоритета, темп отправки). Применяются ко всем вакансиям. */}
          <QueueSettingsSection />
        </TabsContent>
      </Tabs>

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
