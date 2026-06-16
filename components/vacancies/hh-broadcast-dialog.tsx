"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ExternalLink,
  Copy,
  ChevronRight,
  SkipForward,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageSquare,
  Paperclip,
  Save,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface HhBroadcastItem {
  id: string
  name: string
  firstName: string
  chatId: string | null
  chatUrl: string | null
  resumeUrl: string | null
  hasNoChat: boolean
  personalMessage: string
  testLink: string
}

interface HhBroadcastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vacancyId: string
  candidateIds: string[]
  // Вызывается ПОСЛЕ успешной отметки «тест отправлен» (маркер записан в БД) —
  // родитель обновляет список, чтобы в колонке «Тест» сразу появилось «отп.».
  onSent?: () => void
}

// ─── Вспомогательные ──────────────────────────────────────────────────────────

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

// Ссылка кандидату по типу шага. Демо/тест используют один и тот же slug
// (публичные роуты /test и /demo резолвят shortId/token одинаково), поэтому
// переключение — простая замена сегмента пути.
function linkForKind(testLink: string, kind: "test" | "demo"): string {
  if (!testLink) return ""
  return kind === "demo" ? testLink.replace("/test/", "/demo/") : testLink
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export function HhBroadcastDialog({
  open,
  onOpenChange,
  vacancyId,
  candidateIds,
  onSent,
}: HhBroadcastDialogProps) {
  const [phase, setPhase] = useState<"loading" | "wizard" | "done">("loading")
  const [items, setItems] = useState<HhBroadcastItem[]>([])
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [vacancyTitle, setVacancyTitle] = useState("")
  const [savingTpl, setSavingTpl] = useState(false)
  const [savedTpl, setSavedTpl] = useState(false)
  // Тип ссылки, прикреплённой кандидату (тест/демо) — per кандидат.
  const [linkKindById, setLinkKindById] = useState<Record<string, "test" | "demo">>({})
  const [markingAll, setMarkingAll] = useState(false)
  // Темп рассылки: интервал между открытиями чатов (анти-бан) + авто-открытие.
  const [intervalSec, setIntervalSec] = useState(20)
  const [autoOpen, setAutoOpen] = useState(false)
  const [cooldown, setCooldown] = useState(0) // сек до разблокировки кнопки «Открыть»
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Загружаем данные при открытии
  const loadData = useCallback(async () => {
    setPhase("loading")
    setLoadError(null)
    setItems([])
    setMessages({})
    setCurrentIdx(0)
    setSentIds(new Set())
    setSkippedIds(new Set())
    setLinkKindById({})
    setCopied(false)
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/hh-broadcast-data`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds }),
        },
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || "Ошибка загрузки данных")
      }
      const data = (await res.json()) as { items: HhBroadcastItem[]; vacancyTitle?: string }
      setItems(data.items)
      setVacancyTitle(data.vacancyTitle ?? "")
      // Предзаполняем тексты сообщений
      const msgs: Record<string, string> = {}
      for (const item of data.items) msgs[item.id] = item.personalMessage
      setMessages(msgs)
      setPhase("wizard")
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Неизвестная ошибка")
    }
  }, [vacancyId, candidateIds])

  const handleOpenChange = useCallback(
    (o: boolean) => {
      // Загрузку делает useEffect ниже (на проп `open`) — здесь НЕ дублируем,
      // иначе при некоторых версиях Radix два параллельных loadData (гонка).
      if (!o) {
        // Сброс при закрытии
        setPhase("loading")
        setItems([])
      }
      onOpenChange(o)
    },
    [onOpenChange],
  )

  // При открытии — загружаем. ВАЖНО: диалог открывается программно
  // (setOpen(true)), а Radix onOpenChange при этом НЕ вызывается — поэтому
  // грузим данные через useEffect на проп `open`, а не в onOpenChange,
  // иначе loadData не запустится и спиннер «Подготовка данных» висит вечно.
  useEffect(() => {
    if (open && candidateIds.length > 0) void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Одиночный режим (вызов на одного кандидата из строки списка): прячем
  // элементы пакетной рассылки и закрываем окно сразу после копирования.
  const isSingle = candidateIds.length === 1
  const current = items[currentIdx] ?? null
  const currentMessage = current ? (messages[current.id] ?? current.personalMessage) : ""
  const currentKind: "test" | "demo" = current ? (linkKindById[current.id] ?? "test") : "test"
  const currentLink = current ? linkForKind(current.testLink, currentKind) : ""
  const total = items.length
  const processed = sentIds.size + skippedIds.size

  // Запустить обратный отсчёт интервала (замок на кнопку «Открыть»).
  const startCooldown = useCallback(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    setCooldown(intervalSec)
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }, [intervalSec])

  // Отметить кандидата «тест отправлен» (стадия → test_task_sent, колонка «Тест» = «отп.»).
  // Только если прикреплён ТЕСТ (для демо-ссылки стадию теста не двигаем).
  const markCandidateSent = useCallback((id: string, kind: "test" | "demo") => {
    if (kind !== "test") return
    void fetch(`/api/modules/hr/vacancies/${vacancyId}/hh-broadcast-mark-sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: [id] }),
    })
      .then((r) => { if (r.ok) onSent?.() }) // обновляем список ПОСЛЕ записи маркера (без гонки)
      .catch(() => {})
  }, [vacancyId, onSent])

  // Сменить тип прикреплённой ссылки (тест/демо) и заменить её прямо в тексте.
  const changeLinkKind = useCallback((newKind: "test" | "demo") => {
    if (!current) return
    const oldKind = linkKindById[current.id] ?? "test"
    if (oldKind === newKind) return
    const oldLink = linkForKind(current.testLink, oldKind)
    const newLink = linkForKind(current.testLink, newKind)
    if (oldLink && newLink) {
      setMessages((prev) => {
        const msg = prev[current.id] ?? current.personalMessage
        return { ...prev, [current.id]: msg.split(oldLink).join(newLink) }
      })
    }
    setLinkKindById((prev) => ({ ...prev, [current.id]: newKind }))
  }, [current, linkKindById])

  const copyAndOpen = useCallback(async () => {
    if (!current) return
    const text = messages[current.id] ?? current.personalMessage
    const url = current.chatUrl ?? current.resumeUrl
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard может быть недоступен в некоторых браузерах — тихо игнорируем
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer")
    // Скопировал = отправляет вручную → сразу отмечаем «тест отправлен».
    markCandidateSent(current.id, linkKindById[current.id] ?? "test")
    // Одиночный режим: закрываем окно сразу — HR возвращается к списку и
    // кликает иконку чата у следующего кандидата.
    if (isSingle) onOpenChange(false)
  }, [current, messages, markCandidateSent, linkKindById, isSingle, onOpenChange])

  // Авто-открытие: когда замок дошёл до 0 и включён авто-режим — открыть чат.
  // window.open после паузы может быть заблокирован попап-блокером браузера —
  // тогда остаётся ручная кнопка (она снова активна) + подсказка.
  useEffect(() => {
    if (autoOpen && cooldown === 0 && phase === "wizard" && current && !current.hasNoChat) {
      void copyAndOpen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown, autoOpen, phase, currentIdx])

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }, [])

  const markSent = useCallback(() => {
    if (!current) return
    const sentId = current.id
    setSentIds((prev) => new Set([...prev, sentId]))
    markCandidateSent(sentId, linkKindById[sentId] ?? "test")
    const next = currentIdx + 1
    if (next >= total) { setPhase("done"); return }
    setCurrentIdx(next)
    startCooldown() // следующий чат откроется не раньше интервала
  }, [current, currentIdx, total, startCooldown, markCandidateSent, linkKindById])

  const skipCurrent = useCallback(() => {
    if (!current) return
    setSkippedIds((prev) => new Set([...prev, current.id]))
    const next = currentIdx + 1
    if (next >= total) { setPhase("done"); return }
    setCurrentIdx(next)
    startCooldown()
  }, [current, currentIdx, total, startCooldown])

  // Отметить ВСЕХ кандидатов рассылки «тест отправлен» разом (без поштучного клика).
  const markAllSent = useCallback(async () => {
    const ids = items.map((i) => i.id)
    if (ids.length === 0) return
    setMarkingAll(true)
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/hh-broadcast-mark-sent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds: ids }),
        },
      )
      if (res.ok) {
        onSent?.()
        setSentIds(new Set(ids))
        setPhase("done")
      }
    } catch {
      // тихо — кнопка снова доступна
    } finally {
      setMarkingAll(false)
    }
  }, [items, vacancyId, onSent])

  // Сохранить текущий текст как шаблон по умолчанию (тот же, что у «Отправить тест»).
  // Обратная подстановка: видимые значения текущего кандидата → плейсхолдеры,
  // чтобы шаблон остался переиспользуемым (не зашить имя/ссылку конкретного человека).
  const saveTemplate = useCallback(async () => {
    if (!current) return
    let tpl = messages[current.id] ?? current.personalMessage
    const insertedLink = linkForKind(current.testLink, linkKindById[current.id] ?? "test")
    if (insertedLink) tpl = tpl.split(insertedLink).join("{{test_link}}")
    if (vacancyTitle) tpl = tpl.split(vacancyTitle).join("{{vacancy}}")
    if (current.firstName) tpl = tpl.split(current.firstName).join("{{name}}")
    setSavingTpl(true)
    setSavedTpl(false)
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/save-test-invite-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: tpl }),
        },
      )
      if (res.ok) {
        setSavedTpl(true)
        setTimeout(() => setSavedTpl(false), 2500)
      }
    } catch {
      // тихо — кнопка останется доступной для повтора
    } finally {
      setSavingTpl(false)
    }
  }, [current, messages, vacancyTitle, vacancyId, linkKindById])

  // ─── Рендер ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4 text-orange-500" />
            Рассылка через hh
          </DialogTitle>
        </DialogHeader>

        {/* Фаза: загрузка */}
        {phase === "loading" && !loadError && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Подготовка данных…
            </p>
          </div>
        )}

        {/* Фаза: ошибка загрузки */}
        {phase === "loading" && loadError && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-destructive text-center">{loadError}</p>
            <Button variant="outline" onClick={() => void loadData()}>
              Повторить
            </Button>
          </div>
        )}

        {/* Фаза: мастер */}
        {phase === "wizard" && current && (
          <div className="space-y-4 min-w-0">
            {/* Инструкция */}
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
              Платформа не отправляет за вас — она открывает чат и кладёт текст
              в буфер. Вставьте (Ctrl/Cmd+V) и отправьте вручную.
            </div>

            {/* Прогресс — только в пакетном режиме */}
            {!isSingle && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Кандидат {currentIdx + 1} из {total}
                  </span>
                  <span>
                    {processed} {pluralize(processed, "обработан", "обработано", "обработано")} ·{" "}
                    {sentIds.size} {pluralize(sentIds.size, "отправлено", "отправлено", "отправлено")}
                  </span>
                </div>
                <Progress value={((currentIdx) / total) * 100} className="h-1.5" />
              </div>
            )}

            {/* Кандидат */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{current.name}</span>
                {current.hasNoChat && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/40">
                    Нет чата на hh
                  </Badge>
                )}
                {current.chatUrl && (
                  <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                    Чат hh
                  </Badge>
                )}
                {!current.chatUrl && current.resumeUrl && (
                  <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
                    Резюме hh
                  </Badge>
                )}
              </div>
              {current.chatUrl && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {current.chatUrl}
                </p>
              )}
              {!current.chatUrl && current.resumeUrl && (
                <p className="text-[11px] text-muted-foreground truncate">
                  Fallback: {current.resumeUrl}
                </p>
              )}
            </div>

            {/* Редактируемое сообщение */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground">
                  Персональное сообщение (можно отредактировать)
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void saveTemplate()}
                  disabled={savingTpl}
                  title="Сохранить как шаблон по умолчанию — он подставится в будущих рассылках и в кнопке «Отправить тест». Имя, вакансия и ссылка на тест сохранятся как подстановки."
                >
                  {savedTpl ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      Сохранено
                    </>
                  ) : savingTpl ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Сохранение…
                    </>
                  ) : (
                    <>
                      <Save className="size-3.5" />
                      Сохранить шаблон
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={currentMessage}
                onChange={(e) =>
                  setMessages((prev) => ({
                    ...prev,
                    [current.id]: e.target.value,
                  }))
                }
                rows={6}
                className="text-sm resize-none"
              />
              {/* Что прикреплено: тип ссылки (тест/демо) можно переключить — она
                  заменится прямо в тексте. HR видит, что именно уйдёт кандидату. */}
              {current.testLink ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Paperclip className="size-3 shrink-0" />
                    <span className="shrink-0">Ссылка кандидату:</span>
                    <div className="inline-flex items-center gap-0.5">
                      {([["test", "Тест"], ["demo", "Демо"]] as const).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => changeLinkKind(k)}
                          className={
                            "rounded px-1.5 py-0.5 transition-colors " +
                            (currentKind === k
                              ? "bg-primary text-primary-foreground"
                              : "bg-background hover:bg-muted text-muted-foreground")
                          }
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                  <p className="font-mono text-[11px] text-foreground break-all" title={currentLink}>
                    {currentLink}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-destructive">
                  У кандидата нет ссылки.
                </p>
              )}
              {current.testLink && !currentMessage.includes(currentLink) && (
                <p className="text-[11px] text-destructive">
                  ⚠ Ссылки нет в тексте — кандидат её не получит. Проверьте сообщение.
                </p>
              )}
            </div>

            {/* Кнопки действий */}
            <div className="flex items-center gap-2">
              <Button
                className={cn(
                  "flex-1 gap-2",
                  current.hasNoChat && "opacity-50 cursor-not-allowed",
                )}
                disabled={current.hasNoChat || cooldown > 0}
                onClick={() => void copyAndOpen()}
                title={
                  current.hasNoChat
                    ? "Нет чата на hh — ссылка недоступна"
                    : current.chatUrl
                    ? "Скопировать текст и открыть чат hh"
                    : "Скопировать текст и открыть резюме hh"
                }
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    Скопировано!
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Доступно через {cooldown}с
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    Скопировать и открыть чат
                    <ExternalLink className="size-3.5 opacity-60" />
                  </>
                )}
              </Button>
            </div>

            {/* Темп рассылки — анти-бан: равномерный интервал между открытиями.
                Только в пакетном режиме (для одиночного не нужен). */}
            {!isSingle && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Интервал между чатами:</span>
                <div className="flex items-center gap-1">
                  {[10, 20, 30, 60].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setIntervalSec(s)}
                      className={
                        "rounded px-2 py-0.5 transition-colors " +
                        (intervalSec === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted text-muted-foreground")
                      }
                    >{s}с</button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 ml-auto cursor-pointer select-none">
                  <input type="checkbox" checked={autoOpen} onChange={(e) => setAutoOpen(e.target.checked)} className="accent-primary" />
                  <span className="text-muted-foreground">Авто-открытие</span>
                </label>
              </div>
            )}
            {!isSingle && autoOpen && (
              <p className="text-[11px] text-muted-foreground/70 -mt-1">
                Чат следующего откроется сам через интервал. Если браузер заблокирует
                всплывающее окно — разрешите попапы для company24.pro или жмите кнопку вручную.
              </p>
            )}

            {!isSingle && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:border-emerald-700"
                  onClick={markSent}
                >
                  <ChevronRight className="size-4" />
                  Отправлено → следующий
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={skipCurrent}
                >
                  <SkipForward className="size-4" />
                  Пропустить
                </Button>
              </div>
            )}

            {/* Массовая отметка: пометить всех «отправлено» разом, без поштучного клика */}
            {!isSingle && total > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void markAllSent()}
                disabled={markingAll}
                title="Поставить «отп.» в колонке «Тест» всем кандидатам рассылки сразу"
              >
                {markingAll ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Отметить всех отправленными ({total})
              </Button>
            )}
          </div>
        )}

        {/* Фаза: завершено */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="size-10 text-emerald-500" />
            <div className="text-center space-y-1">
              <p className="font-medium">Рассылка завершена</p>
              <p className="text-sm text-muted-foreground">
                Отправлено: <strong>{sentIds.size}</strong> из{" "}
                <strong>{total}</strong>
                {skippedIds.size > 0 && (
                  <>, пропущено: {skippedIds.size}</>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Закрыть
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
