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
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  FilePlus2,
  Trash2,
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

// Именованный шаблон рассылки (хранит ТЕКСТ С ПЛЕЙСХОЛДЕРАМИ).
interface BroadcastTemplate {
  id: string
  name: string
  text: string
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

// Тип ссылки кандидату: тест/демо (персональная, генерируется автоматически)
// или сама вакансия hh (общая, у вакансии своя ссылка). Юрий 03.07.
type LinkKind = "test" | "demo" | "vacancy"

// Ссылка кандидату по типу. Демо/тест — один slug (роуты /test и /demo
// резолвят shortId/token одинаково), «Вакансия» — общий hh-URL вакансии.
function linkForKind(testLink: string, kind: LinkKind, vacancyHhUrl: string): string {
  if (kind === "vacancy") return vacancyHhUrl
  if (!testLink) return ""
  return kind === "demo" ? testLink.replace("/test/", "/demo/") : testLink
}

// Обратная подстановка: видимые значения текущего кандидата → плейсхолдеры,
// чтобы шаблон остался переиспользуемым (не зашить имя/ссылку конкретного человека).
function toTemplateText(
  text: string,
  opts: { link?: string; vacancy?: string; firstName?: string },
): string {
  let tpl = text
  if (opts.link) tpl = tpl.split(opts.link).join("{{test_link}}")
  if (opts.vacancy) tpl = tpl.split(opts.vacancy).join("{{vacancy}}")
  if (opts.firstName) tpl = tpl.split(opts.firstName).join("{{name}}")
  return tpl
}

// Прямая подстановка: плейсхолдеры шаблона → значения текущего кандидата,
// чтобы при выборе шаблона в textarea подставился готовый персональный текст.
function fromTemplateText(
  text: string,
  opts: { link?: string; vacancy?: string; firstName?: string },
): string {
  let out = text
  if (opts.firstName) out = out.split("{{name}}").join(opts.firstName)
  if (opts.vacancy) out = out.split("{{vacancy}}").join(opts.vacancy)
  if (opts.link) out = out.split("{{test_link}}").join(opts.link)
  return out
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
  const [vacancyHhUrl, setVacancyHhUrl] = useState("")
  const [savingTpl, setSavingTpl] = useState(false)
  const [savedTpl, setSavedTpl] = useState(false)
  // Менеджер именованных шаблонов рассылки.
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([])
  const [selectedTplId, setSelectedTplId] = useState<string>("") // "" = «— Новый —»
  const [tplName, setTplName] = useState("")
  const [tplToast, setTplToast] = useState<string | null>(null) // короткое подтверждение под кнопками
  const tplToastRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Тип ссылки, прикреплённой кандидату (тест/демо) — per кандидат.
  const [linkKindById, setLinkKindById] = useState<Record<string, LinkKind>>({})
  const [markingAll, setMarkingAll] = useState(false)
  // Последний выбор (Юрий 03.07): тип ссылки — глобально, шаблон — per-вакансия.
  // Применяется авто к каждому новому кандидату; хранится в localStorage,
  // чтобы «в следующий раз захожу — вижу тот же выбор».
  const lastKindRef = useRef<LinkKind | null>(null)
  const lastTplRef = useRef<string | null>(null)
  useEffect(() => {
    try {
      const k = window.localStorage.getItem("hhbc:lastKind")
      if (k === "test" || k === "demo" || k === "vacancy") lastKindRef.current = k
      const t = window.localStorage.getItem(`hhbc:lastTpl:${vacancyId}`)
      if (t) lastTplRef.current = t
    } catch { /* localStorage недоступен */ }
  }, [vacancyId])
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
    setSelectedTplId("")
    setTplName("")
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
      const data = (await res.json()) as { items: HhBroadcastItem[]; vacancyTitle?: string; vacancyHhUrl?: string }
      setItems(data.items)
      setVacancyTitle(data.vacancyTitle ?? "")
      setVacancyHhUrl((data as { vacancyHhUrl?: string }).vacancyHhUrl ?? "")
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

  // Загрузить список именованных шаблонов при открытии диалога.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/modules/hr/vacancies/${vacancyId}/broadcast-templates`,
        )
        if (!res.ok) return
        const data = (await res.json()) as { templates?: BroadcastTemplate[] }
        if (!cancelled) setTemplates(data.templates ?? [])
      } catch {
        // тихо — менеджер шаблонов не критичен для основного потока
      }
    })()
    return () => { cancelled = true }
  }, [open, vacancyId])

  // Короткий тост-подтверждение под кнопками управления шаблонами.
  const showTplToast = useCallback((msg: string) => {
    setTplToast(msg)
    if (tplToastRef.current) clearTimeout(tplToastRef.current)
    tplToastRef.current = setTimeout(() => setTplToast(null), 2500)
  }, [])
  useEffect(() => () => { if (tplToastRef.current) clearTimeout(tplToastRef.current) }, [])

  // Одиночный режим (вызов на одного кандидата из строки списка): прячем
  // элементы пакетной рассылки и закрываем окно сразу после копирования.
  const isSingle = candidateIds.length === 1
  const current = items[currentIdx] ?? null
  const currentMessage = current ? (messages[current.id] ?? current.personalMessage) : ""
  const currentKind: LinkKind = current ? (linkKindById[current.id] ?? "test") : "test"
  const currentLink = current ? linkForKind(current.testLink, currentKind, vacancyHhUrl) : ""

  // Авто-применить последний выбор (тип ссылки + шаблон) к новому кандидату —
  // если пользователь ещё НЕ трогал этого кандидата вручную (Юрий 03.07:
  // «открываю следующего — тот же шаблон и вакансия выбраны, жму кнопку»).
  useEffect(() => {
    if (!current) return
    if (messages[current.id] !== undefined || linkKindById[current.id] !== undefined) return
    const kind = lastKindRef.current
    const tpl = lastTplRef.current ? templates.find((t) => t.id === lastTplRef.current) : null
    if (!kind && !tpl) return
    const effKind: LinkKind = kind ?? "test"
    if (kind) setLinkKindById((prev) => ({ ...prev, [current.id]: kind }))
    if (tpl) {
      setSelectedTplId(tpl.id)
      setTplName(tpl.name)
      const filled = fromTemplateText(tpl.text, {
        link: linkForKind(current.testLink, effKind, vacancyHhUrl),
        vacancy: vacancyTitle,
        firstName: current.firstName,
      })
      setMessages((prev) => ({ ...prev, [current.id]: filled }))
    }
  }, [current?.id, templates]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const markCandidateSent = useCallback((id: string, kind: LinkKind) => {
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
  const changeLinkKind = useCallback((newKind: LinkKind) => {
    if (!current) return
    const oldKind = linkKindById[current.id] ?? "test"
    if (oldKind === newKind) return
    const oldLink = linkForKind(current.testLink, oldKind, vacancyHhUrl)
    const newLink = linkForKind(current.testLink, newKind, vacancyHhUrl)
    if (oldLink && newLink) {
      setMessages((prev) => {
        const msg = prev[current.id] ?? current.personalMessage
        return { ...prev, [current.id]: msg.split(oldLink).join(newLink) }
      })
    }
    setLinkKindById((prev) => ({ ...prev, [current.id]: newKind }))
    lastKindRef.current = newKind
    try { window.localStorage.setItem("hhbc:lastKind", newKind) } catch { /* noop */ }
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

  // ─── Менеджер шаблонов ──────────────────────────────────────────────────
  // Шаблон хранит ТЕКСТ С ПЛЕЙСХОЛДЕРАМИ. Перед записью — обратная подстановка
  // (значения текущего кандидата → {{...}}), при выборе — прямая (→ значения).

  // Шаблонизировать текущий текст textarea (значения кандидата → плейсхолдеры).
  const currentAsTemplateText = useCallback((): string => {
    if (!current) return ""
    const text = messages[current.id] ?? current.personalMessage
    return toTemplateText(text, {
      link: linkForKind(current.testLink, linkKindById[current.id] ?? "test", vacancyHhUrl),
      vacancy: vacancyTitle,
      firstName: current.firstName,
    })
  }, [current, messages, vacancyTitle, linkKindById])

  // Выбор шаблона из списка — подставить его текст (с раскрытыми плейсхолдерами)
  // в textarea и имя в поле названия. Пустое значение = «— Новый —».
  const applyTemplate = useCallback((tplId: string) => {
    setSelectedTplId(tplId)
    // Запоминаем последний выбранный шаблон (per-вакансия); «— Новый —» очищает.
    lastTplRef.current = tplId || null
    try {
      if (tplId) window.localStorage.setItem(`hhbc:lastTpl:${vacancyId}`, tplId)
      else window.localStorage.removeItem(`hhbc:lastTpl:${vacancyId}`)
    } catch { /* noop */ }
    if (!tplId) { setTplName(""); return }
    const tpl = templates.find((t) => t.id === tplId)
    if (!tpl || !current) return
    setTplName(tpl.name)
    const filled = fromTemplateText(tpl.text, {
      link: linkForKind(current.testLink, linkKindById[current.id] ?? "test", vacancyHhUrl),
      vacancy: vacancyTitle,
      firstName: current.firstName,
    })
    setMessages((prev) => ({ ...prev, [current.id]: filled }))
  }, [templates, current, vacancyTitle, linkKindById, vacancyId])

  // POST к менеджеру шаблонов; возвращает обновлённый список или null при ошибке.
  const postTemplate = useCallback(async (
    payload: { action: "create" | "update" | "delete"; id?: string; name?: string; text?: string },
  ): Promise<BroadcastTemplate[] | null> => {
    try {
      const res = await fetch(
        `/api/modules/hr/vacancies/${vacancyId}/broadcast-templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) return null
      const data = (await res.json()) as { templates?: BroadcastTemplate[] }
      return data.templates ?? []
    } catch {
      return null
    }
  }, [vacancyId])

  // «Сохранить»: update выбранного шаблона, либо create если шаблон не выбран.
  const saveTemplate = useCallback(async () => {
    if (!current) return
    const name = tplName.trim()
    if (!name) { showTplToast("Укажите название шаблона"); return }
    const text = currentAsTemplateText()
    setSavingTpl(true)
    setSavedTpl(false)
    try {
      const next = selectedTplId
        ? await postTemplate({ action: "update", id: selectedTplId, name, text })
        : await postTemplate({ action: "create", name, text })
      if (next) {
        setTemplates(next)
        // При create найти только что созданный (по имени+тексту) и выбрать его.
        if (!selectedTplId) {
          const created = next.find((t) => t.name === name && t.text === text)
          if (created) setSelectedTplId(created.id)
        }
        setSavedTpl(true)
        setTimeout(() => setSavedTpl(false), 2500)
        showTplToast("Сохранено")
      } else {
        showTplToast("Не удалось сохранить шаблон — попробуйте ещё раз")
      }
    } finally {
      setSavingTpl(false)
    }
  }, [current, tplName, selectedTplId, currentAsTemplateText, postTemplate, showTplToast])

  // «Сохранить как новое»: всегда create.
  const saveTemplateAsNew = useCallback(async () => {
    if (!current) return
    const name = tplName.trim()
    if (!name) { showTplToast("Укажите название шаблона"); return }
    const text = currentAsTemplateText()
    const next = await postTemplate({ action: "create", name, text })
    if (next) {
      setTemplates(next)
      const created = next.find((t) => t.name === name && t.text === text)
      if (created) setSelectedTplId(created.id)
      showTplToast("Создан шаблон")
    } else {
      showTplToast("Не удалось создать шаблон — попробуйте ещё раз")
    }
  }, [current, tplName, currentAsTemplateText, postTemplate, showTplToast])

  // Удалить выбранный шаблон.
  const deleteTemplate = useCallback(async () => {
    if (!selectedTplId) return
    const next = await postTemplate({ action: "delete", id: selectedTplId })
    if (next) {
      setTemplates(next)
      setSelectedTplId("")
      setTplName("")
      showTplToast("Шаблон удалён")
    }
  }, [selectedTplId, postTemplate, showTplToast])

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
            {/* Инструкция — три шага (Юрий 03.07) */}
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-medium">Как отправить (платформа не отправляет за вас):</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Проверьте текст и, если нужно, пересохраните шаблон.</li>
                <li>Нажмите «Скопировать и открыть чат» — откроется резюме на hh, текст уже в буфере.</li>
                <li>Войдите в чат и вставьте (Ctrl/Cmd+V) — отправьте сообщение.</li>
              </ol>
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
              <label className="text-xs text-muted-foreground">
                Персональное сообщение (можно отредактировать)
              </label>
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
              {(current.testLink || vacancyHhUrl) ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Paperclip className="size-3 shrink-0" />
                    <span className="shrink-0">Ссылка кандидату:</span>
                    <div className="inline-flex items-center gap-0.5">
                      {([
                        ...(current.testLink ? [["test", "Тест"], ["demo", "Демо"]] as const : []),
                        ...(vacancyHhUrl ? [["vacancy", "Вакансия"]] as const : []),
                      ]).map(([k, label]) => (
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
                  {/* Подсказка: демо/тест — персональная ссылка авто-генерится;
                      «Вакансия» — общая ссылка hh (Юрий 03.07). */}
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {currentKind === "vacancy"
                      ? "Это общая ссылка на вакансию hh — одинаковая для всех кандидатов."
                      : "Для «Тест»/«Демо» персональная ссылка кандидата генерируется автоматически."}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-destructive">
                  У кандидата нет ссылки.
                </p>
              )}
              {/* Ссылки нет в тексте — предупреждаем, только если она вообще есть.
                  Для «Вакансия» проверяем ту же currentLink (URL вакансии). */}
              {currentLink && !currentMessage.includes(currentLink) && (
                <p className="text-[11px] text-destructive">
                  ⚠ Ссылки нет в тексте — кандидат её не получит. Проверьте сообщение или переключите тип ссылки.
                </p>
              )}
            </div>

            {/* Менеджер шаблонов: выбор из сохранённых, имя, сохранить/новый/удалить.
                Шаблон хранит текст с плейсхолдерами; выбор подставляет персональный
                текст текущего кандидата, сохранение — шаблонизирует обратно. */}
            <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Save className="size-3.5" />
                Шаблоны
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selectedTplId} onValueChange={applyTemplate}>
                  <SelectTrigger className="h-8 flex-1 min-w-[160px] text-xs">
                    <SelectValue placeholder="— Новый —" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Пока нет сохранённых шаблонов
                      </div>
                    ) : (
                      templates.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedTplId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => void deleteTemplate()}
                    title="Удалить выбранный шаблон"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              <Input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Название шаблона"
                className="h-8 text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void saveTemplate()}
                  disabled={savingTpl}
                  title={selectedTplId
                    ? "Сохранить изменения в выбранном шаблоне"
                    : "Создать шаблон с этим названием и текстом"}
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
                      Сохранить
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void saveTemplateAsNew()}
                  title="Создать новый шаблон с текущими названием и текстом"
                >
                  <FilePlus2 className="size-3.5" />
                  Сохранить как новое
                </Button>
                {tplToast && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    {tplToast}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                Шаблон хранит текст с подстановками (имя, вакансия, ссылка) — он
                переиспользуется для других кандидатов.
              </p>
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
