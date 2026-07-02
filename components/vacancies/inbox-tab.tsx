"use client"

// Таб «Инбокс» страницы вакансии — единый чат-инбокс.
// Двухпанельный: слева список тредов (ручка
// GET /api/modules/hr/vacancies/[id]/inbox), справа — нить выбранного
// кандидата (HhChatThread) через существующий hh messages-эндпоинт.
//
// Список поллится раз в 45 сек (плюс кнопка «Обновить»), чтобы подтягивались
// новые входящие. Нить справа сама грузит и отправляет сообщения.

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { HhChatThread } from "@/components/candidates/hh-chat-thread"

interface InboxThread {
  candidateId: string
  hhResponseId: string
  name: string
  stage: string | null
  stageLabel: string
  lastMessage: {
    text: string
    from: "applicant" | "employer"
    at: string | null
  } | null
  unread: boolean
}

interface InboxTabProps {
  vacancyId: string
}

const POLL_MS = 45_000

function formatAt(at: string | null): string {
  if (!at) return ""
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function InboxTab({ vacancyId }: InboxTabProps) {
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      else setLoading(true)
      try {
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/inbox`)
        const data = (await res.json()) as { threads?: InboxThread[]; error?: string }
        if (!res.ok) {
          setError(data.error ?? `Ошибка ${res.status}`)
          return
        }
        setError(null)
        setThreads(Array.isArray(data.threads) ? data.threads : [])
      } catch (err) {
        console.error("[inbox-tab] load failed", err)
        setError(err instanceof Error ? err.message : "Сетевая ошибка")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [vacancyId],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Полл списка — подтягиваем новые входящие. Ссылка на load стабильна.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const t = setInterval(() => void loadRef.current(true), POLL_MS)
    return () => clearInterval(t)
  }, [])

  const selected = threads.find((t) => t.candidateId === selectedId) ?? null

  return (
    <div className="flex h-[70vh] min-h-[520px] rounded-lg border border-border/60 overflow-hidden">
      {/* Левая панель — список тредов */}
      <div className="w-[340px] shrink-0 border-r border-border/60 flex flex-col min-h-0 bg-muted/20">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            Переписки
            {threads.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">({threads.length})</span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Обновить
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-xs text-muted-foreground">
              {error}
              <button className="block mt-2 underline" onClick={() => void load()}>
                Повторить
              </button>
            </div>
          ) : threads.length === 0 ? (
            <div className="px-3 py-8 text-xs text-muted-foreground text-center">
              Пока нет переписок с кандидатами по этой вакансии.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {threads.map((t) => {
                const active = t.candidateId === selectedId
                return (
                  <li key={t.candidateId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.candidateId)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 transition-colors",
                        active ? "bg-background" : "hover:bg-background/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.unread && (
                            <Badge className="h-4 px-1.5 text-[10px] leading-none bg-indigo-500 hover:bg-indigo-500 text-white border-transparent">
                              новое
                            </Badge>
                          )}
                          {t.lastMessage?.at && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {formatAt(t.lastMessage.at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.stageLabel && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{t.stageLabel}</span>
                        )}
                      </div>
                      <p
                        className={cn(
                          "text-xs mt-0.5 truncate",
                          t.unread ? "text-foreground font-medium" : "text-muted-foreground",
                        )}
                      >
                        {t.lastMessage
                          ? (t.lastMessage.from === "employer" ? "Вы: " : "") + t.lastMessage.text
                          : "нет сообщений"}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Правая панель — нить выбранного кандидата */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{selected.name}</div>
                {selected.stageLabel && (
                  <div className="text-[11px] text-muted-foreground">{selected.stageLabel}</div>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <HhChatThread
                key={selected.candidateId}
                hhResponseId={selected.hhResponseId}
                candidateName={selected.name}
                className="h-full"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Выберите кандидата слева
          </div>
        )}
      </div>
    </div>
  )
}
