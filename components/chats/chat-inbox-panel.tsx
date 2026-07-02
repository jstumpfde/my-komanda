"use client"

// Общая двухпанельная панель чатов (эталон UX — чаты hh.ru).
// Две точки входа рендерят ЭТОТ компонент:
//   1. Глобальный плавающий виджет «Чаты» (components/chats/global-chat-widget.tsx)
//      — без fixedVacancyId: все вакансии компании + фильтр по вакансиям + поиск.
//   2. Таб «Инбокс» на странице вакансии (components/vacancies/inbox-tab.tsx)
//      — с fixedVacancyId: только треды этой вакансии, фильтр по вакансиям скрыт.
//
// Данные — GET /api/modules/hr/inbox (агрегирующая ручка поверх
// hh_responses.messagesCache, hh API не дёргает). Нить справа — существующий
// HhChatThread (GET/POST /api/integrations/hh/messages/[hhResponseId]).
//
// Быстрые действия в шапке треда переиспользуют штатный flow списка кандидатов:
//   «Пригласить» = advance (getNextColumnId → PUT /candidates/[id]/stage),
//   «Отказать»   = диалог причины → PUT stage "rejected" (отложенная отправка
//                  отказа — та же серверная логика, что у кнопки ✗ в списке).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Loader2, RefreshCw, MessageSquare, Search, SlidersHorizontal,
  ExternalLink, MoreHorizontal, CheckCircle2, XCircle, UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { HhChatThread } from "@/components/candidates/hh-chat-thread"
import { CandidateAvatar } from "@/components/dashboard/candidate-avatar"
import { getNextColumnId } from "@/lib/column-config"

interface InboxThread {
  candidateId: string
  hhResponseId: string
  name: string
  photoUrl: string | null
  resumeUrl: string | null
  vacancyId: string
  vacancyTitle: string
  vacancyCity: string | null
  stage: string | null
  stageLabel: string
  lastMessage: {
    text: string
    from: "applicant" | "employer"
    at: string | null
  } | null
  unreadCount: number
}

interface ChatInboxPanelProps {
  /** Ограничить панель одной вакансией (таб «Инбокс»): фильтр по вакансиям скрыт. */
  fixedVacancyId?: string
  className?: string
  /** Колбэк после загрузки списка — глобальный виджет обновляет бейдж. */
  onThreadsLoaded?: (totalUnread: number) => void
}

const POLL_MS = 45_000

// Градиент fallback-инициалов (фото нет) — фирменный фиолетовый эталона.
const AVATAR_FROM = "#8b5cf6"
const AVATAR_TO = "#6d28d9"

function formatAt(at: string | null): string {
  if (!at) return ""
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ""
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

export function ChatInboxPanel({ fixedVacancyId, className, onThreadsLoaded }: ChatInboxPanelProps) {
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  // Фильтр по вакансиям: пустой Set = «Все вакансии».
  const [vacancyFilter, setVacancyFilter] = useState<Set<string>>(new Set())
  // Диалог отказа (переиспользуем UX штатного диалога списка кандидатов).
  const [rejectFor, setRejectFor] = useState<InboxThread | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [actionBusy, setActionBusy] = useState(false)

  const onLoadedRef = useRef(onThreadsLoaded)
  onLoadedRef.current = onThreadsLoaded

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      else setLoading(true)
      try {
        const qs = fixedVacancyId ? `?vacancyId=${fixedVacancyId}` : ""
        const res = await fetch(`/api/modules/hr/inbox${qs}`)
        const data = (await res.json()) as {
          threads?: InboxThread[]
          totalUnread?: number
          error?: string
        }
        if (!res.ok) {
          setError(data.error ?? `Ошибка ${res.status}`)
          return
        }
        setError(null)
        setThreads(Array.isArray(data.threads) ? data.threads : [])
        onLoadedRef.current?.(data.totalUnread ?? 0)
      } catch (err) {
        console.error("[chat-inbox] load failed", err)
        setError(err instanceof Error ? err.message : "Сетевая ошибка")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [fixedVacancyId],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Полл списка — подтягиваем новые входящие.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const t = setInterval(() => void loadRef.current(true), POLL_MS)
    return () => clearInterval(t)
  }, [])

  // Вакансии для фильтра — из самих тредов (без отдельной ручки).
  const vacancyOptions = useMemo(() => {
    const map = new Map<string, { id: string; title: string; city: string | null }>()
    for (const t of threads) {
      if (!map.has(t.vacancyId)) map.set(t.vacancyId, { id: t.vacancyId, title: t.vacancyTitle, city: t.vacancyCity })
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, "ru"))
  }, [threads])

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return threads.filter((t) => {
      if (vacancyFilter.size > 0 && !vacancyFilter.has(t.vacancyId)) return false
      if (q && !t.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [threads, search, vacancyFilter])

  const selected = threads.find((t) => t.candidateId === selectedId) ?? null

  // ── Быстрые действия: тот же API, что кнопки ✓/✗ в списке кандидатов ──
  // PUT /api/modules/hr/candidates/[id]/stage — серверная логика (hh-синк,
  // отложенный отказ, вебхуки) общая со списком.
  const putStage = useCallback(async (candidateId: string, stage: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const handleInvite = useCallback(async (t: InboxThread) => {
    if (actionBusy) return
    setActionBusy(true)
    try {
      // Как в пагинированном списке: advance = следующая стадия воронки.
      const nextId = getNextColumnId(t.stage ?? "new")
      const ok = await putStage(t.candidateId, nextId ?? "hired")
      if (ok) {
        toast.success(nextId ? `${t.name} → следующий этап` : `🎉 ${t.name} — нанят!`)
        void load(true)
      } else {
        toast.error("Не удалось обновить статус")
      }
    } finally {
      setActionBusy(false)
    }
  }, [actionBusy, putStage, load])

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectFor || actionBusy) return
    setActionBusy(true)
    try {
      const ok = await putStage(rejectFor.candidateId, "rejected")
      if (ok) {
        toast.success(`${rejectFor.name} отклонён`)
        void load(true)
      } else {
        toast.error("Не удалось отказать")
      }
    } finally {
      setActionBusy(false)
      setRejectFor(null)
      setRejectReason("")
    }
  }, [rejectFor, actionBusy, putStage, load])

  const cardHref = (t: InboxThread) => `/hr/vacancies/${t.vacancyId}?candidate=${t.candidateId}`

  return (
    <div className={cn("flex min-h-0 h-full overflow-hidden", className)}>
      {/* ── Левая панель: список чатов ── */}
      <div className="w-[320px] shrink-0 border-r border-border/60 flex flex-col min-h-0 bg-muted/20">
        <div className="px-3 py-2.5 border-b border-border/60 shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Переписки
              {threads.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">({visibleThreads.length})</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!fixedVacancyId && vacancyOptions.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn("h-7 w-7 p-0", vacancyFilter.size > 0 && "text-primary bg-primary/10")}
                      title="Фильтр по вакансиям"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-2">
                    <p className="text-xs font-medium px-2 py-1.5 text-muted-foreground">По вакансиям</p>
                    {/* Строки-«чекбоксы» — div, не button: Radix Checkbox сам
                        рендерит button, вложенный button невалиден. */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted text-left cursor-pointer"
                      onClick={() => setVacancyFilter(new Set())}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setVacancyFilter(new Set()) } }}
                    >
                      <Checkbox checked={vacancyFilter.size === 0} className="pointer-events-none" />
                      Все вакансии
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {vacancyOptions.map((v) => {
                        const checked = vacancyFilter.has(v.id)
                        const toggle = () =>
                          setVacancyFilter((prev) => {
                            const next = new Set(prev)
                            if (checked) next.delete(v.id)
                            else next.add(v.id)
                            return next
                          })
                        return (
                          <div
                            key={v.id}
                            role="button"
                            tabIndex={0}
                            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted text-left cursor-pointer"
                            onClick={toggle}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle() } }}
                          >
                            <Checkbox checked={checked} className="pointer-events-none" />
                            <span className="min-w-0 flex-1 truncate">
                              {v.title}
                              {v.city && <span className="text-muted-foreground"> · {v.city}</span>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => void load(true)}
                disabled={refreshing}
                title="Обновить"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени…"
              className="h-8 pl-8 text-sm"
            />
          </div>
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
          ) : visibleThreads.length === 0 ? (
            <div className="px-3 py-8 text-xs text-muted-foreground text-center">
              {threads.length === 0
                ? "Пока нет переписок с кандидатами."
                : "Ничего не найдено по фильтрам."}
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {visibleThreads.map((t) => {
                const active = t.candidateId === selectedId
                return (
                  <li key={t.candidateId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.candidateId)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 transition-colors flex gap-2.5",
                        active ? "bg-background" : "hover:bg-background/60",
                      )}
                    >
                      <div className="shrink-0 pt-0.5">
                        <CandidateAvatar
                          candidateId={t.candidateId}
                          name={t.name}
                          photoUrl={t.photoUrl}
                          colorFrom={AVATAR_FROM}
                          colorTo={AVATAR_TO}
                          zoomable={false}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{t.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {t.unreadCount > 0 && (
                              <Badge className="h-4 min-w-4 px-1 text-[10px] leading-none justify-center bg-blue-500 hover:bg-blue-500 text-white border-transparent">
                                {t.unreadCount > 99 ? "99+" : t.unreadCount}
                              </Badge>
                            )}
                            {t.lastMessage?.at && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {formatAt(t.lastMessage.at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {fixedVacancyId ? t.stageLabel : t.vacancyTitle}
                        </p>
                        <p
                          className={cn(
                            "text-xs mt-0.5 truncate",
                            t.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground",
                          )}
                        >
                          {t.lastMessage
                            ? (t.lastMessage.from === "employer" ? "Вы: " : "") + t.lastMessage.text
                            : "нет сообщений"}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Правая панель: тред выбранного кандидата ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 shrink-0">
              <div className="min-w-0 flex items-center gap-2.5">
                <CandidateAvatar
                  candidateId={selected.candidateId}
                  name={selected.name}
                  photoUrl={selected.photoUrl}
                  colorFrom={AVATAR_FROM}
                  colorTo={AVATAR_TO}
                  zoomable={false}
                />
                <div className="min-w-0">
                  <a
                    href={cardHref(selected)}
                    className="text-sm font-semibold truncate block hover:underline"
                    title="Открыть карточку кандидата"
                  >
                    {selected.name}
                  </a>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {selected.vacancyTitle}
                    {selected.vacancyCity ? ` · ${selected.vacancyCity}` : ""}
                    {selected.stageLabel ? ` · ${selected.stageLabel}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {selected.resumeUrl && (
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" asChild>
                    <a href={selected.resumeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Открыть резюме
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs text-success border-success/40 hover:bg-success/10 hover:text-success"
                  disabled={actionBusy}
                  onClick={() => void handleInvite(selected)}
                  title="Пригласить (следующий этап)"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Пригласить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  disabled={actionBusy}
                  onClick={() => {
                    setRejectReason("")
                    setRejectFor(selected)
                  }}
                  title="Отказать"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Отказать
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ещё">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a href={cardHref(selected)}>
                        <UserRound className="w-4 h-4" />
                        Карточка кандидата
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`/hr/vacancies/${selected.vacancyId}`}>
                        <MessageSquare className="w-4 h-4" />
                        Открыть вакансию
                      </a>
                    </DropdownMenuItem>
                    {selected.resumeUrl && (
                      <DropdownMenuItem asChild>
                        <a href={selected.resumeUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                          Резюме на hh
                        </a>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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

      {/* Диалог отказа — тот же UX, что у кнопки ✗ в списке кандидатов. */}
      <Dialog open={!!rejectFor} onOpenChange={(open) => { if (!open) setRejectFor(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отказать кандидату</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Укажите причину отказа (необязательно)</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Причина отказа..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Отмена</Button>
            <Button variant="destructive" disabled={actionBusy} onClick={() => void handleRejectConfirm()}>
              Отказать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
