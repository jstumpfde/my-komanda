"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  TableCard, DataTable, DataHead, DataHeadCell, DataSelectHeadCell,
  DataRow, DataCell,
} from "@/components/ui/data-table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Loader2, Pencil, Check, X, Trash2, AlertTriangle, Search,
  ChevronRight, ChevronDown, Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface QueueItem {
  messageId: string
  candidateId: string
  candidateName: string
  hhFirst: string | null
  hhLast: string | null
  override: string | null
  resolvedName: string
  nameSource: string
  needsCheck: boolean
  scheduledAt: string
  sentAt: string | null
  status: string                 // pending | sending | sent | cancelled | failed
  waitingReason: string | null   // только для pending/sending
  branch: string
  touchNumber: number
  preview: string
}

const BRANCH_LABELS: Record<string, string> = {
  not_opened: "Дожим (не открыл демо)", opened_not_finished: "Дожим (открыл, не дошёл)",
  anketa_confirmation: "Подтверждение анкеты", anketa_auto_reply: "Автоответ анкеты",
  first_msg_2: "Сообщение 2", first_msg_3: "Сообщение 3", first_msg_offhours: "Внерабочий отклик",
  test_after_message: "После теста", test_invite: "Приглашение на тест",
  test_reminder: "Напоминание о тесте", test_not_opened: "Дожим по тесту (не открыл)",
  test_opened_not_submitted: "Дожим по тесту (не отправил)", schedule_invite: "Приглашение на интервью",
}

// branch может быть вида funnelv2:<stageId> — показываем как «Дожим стадии».
function branchLabel(branch: string): string {
  if (branch.startsWith("funnelv2:")) return "Дожим стадии"
  return BRANCH_LABELS[branch] ?? branch
}

// Русские ярлыки + цвет статуса. Цвета — как в проекте (Tailwind-токены,
// без кастомных hex): ждёт=amber, отправлено=emerald, отменено=muted,
// ошибка=destructive, отправляется=amber. Badge variant="outline" + классы.
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "ждёт",          cls: "text-amber-700 dark:text-amber-400 border-amber-300/60 bg-amber-500/10" },
  sending:   { label: "отправляется",  cls: "text-amber-700 dark:text-amber-400 border-amber-300/60 bg-amber-500/10" },
  sent:      { label: "отправлено",    cls: "text-emerald-700 dark:text-emerald-400 border-emerald-300/60 bg-emerald-500/10" },
  cancelled: { label: "отменено",      cls: "text-muted-foreground border-muted-foreground/30 bg-muted/40" },
  failed:    { label: "ошибка",        cls: "text-destructive border-destructive/40 bg-destructive/10" },
}

// Опции фильтра по статусу (порядок в дропдауне).
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all",       label: "Все статусы" },
  { value: "pending",   label: "Ждёт" },
  { value: "sent",      label: "Отправлено" },
  { value: "cancelled", label: "Отменено" },
  { value: "failed",    label: "Ошибка" },
]

const SOURCE_NOTE: Record<string, string> = {
  hh_last_swap: "имя взято из поля «Фамилия» на hh — кандидат перепутал поля",
  hh_first_raw: "имя не из справочника — проверьте, не фамилия ли это",
  neutral:      "имя не распознано — уйдёт нейтральное «Здравствуйте»",
}

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso))
  } catch { return iso }
}

// Короткое HH:MM (МСК) — для колонки «Уйдёт в».
function fmtHHMM(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso))
  } catch { return iso }
}

interface Props {
  vacancyId: string
  onChanged?: () => void   // дёрнуть при отмене сообщения (обновить счётчики секции)
}

/** Инлайн-журнал очереди рассылки в виде таблицы-списка (как список кандидатов):
 *  одна строка — одно касание. Показывает и запланированные (pending/sending),
 *  и недавно завершённые (sent/cancelled/failed за последнюю неделю). На строку:
 *  «Уйдёт в» (плановое время / факт отправки, МСК), русский бейдж статуса с цветом,
 *  причина ожидания (для pending), тип касания русским ярлыком. Фильтры (поиск по
 *  имени, тип касания, статус, «только проверить»), правка обращения, раскрытие
 *  полного текста по клику, одиночное и массовое удаление ещё-не-ушедших сообщений.
 *  Не в Sheet — прямо на вкладке. */
export function MessageQueueJournal({ vacancyId, onChanged }: Props) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<QueueItem[]>([])
  const [needsCheck, setNeedsCheck] = useState(0)
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Раскрытые строки (полный текст сообщения) и выбор для массовых действий.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastSelectedIdRef = useRef<string | null>(null)

  // Фильтры
  const [search, setSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [onlyCheck, setOnlyCheck] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const data = json.data ?? json
      setItems(data.items ?? [])
      setNeedsCheck(data.needsCheck ?? 0)
    } catch {
      toast.error("Не удалось загрузить очередь")
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Сколько ЕЩЁ НЕ УШЕДШИХ сообщений у каждого кандидата (для бейджа «группа из N»
  // и группового удаления). Завершённые (sent/cancelled/failed) не считаем —
  // групповая отмена трогает только pending.
  const pendingCountByCandidate = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      if (it.status === "pending" || it.status === "sending") {
        m.set(it.candidateId, (m.get(it.candidateId) ?? 0) + 1)
      }
    }
    return m
  }, [items])

  // Список веток, реально присутствующих в очереди — для дропдауна
  const branches = useMemo(() => {
    const set = new Set<string>()
    items.forEach((m) => set.add(m.branch))
    return [...set]
  }, [items])

  // Применяем фильтры: поиск по имени, тип касания, статус, «проверить».
  // Статус 'pending' в фильтре включает и 'sending' (в полёте) — оба «ещё не ушли».
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((m) => !onlyCheck || m.needsCheck)
      .filter((m) => branchFilter === "all" || m.branch === branchFilter)
      .filter((m) =>
        statusFilter === "all" ||
        m.status === statusFilter ||
        (statusFilter === "pending" && m.status === "sending"),
      )
      .filter((m) =>
        !q ||
        m.candidateName.toLowerCase().includes(q) ||
        (m.resolvedName ?? "").toLowerCase().includes(q),
      )
  }, [items, search, branchFilter, statusFilter, onlyCheck])

  // Для выделения/массового удаления берём только ещё-не-ушедшие строки —
  // отменить sent/cancelled/failed нельзя, чекбокс у них выключен.
  const visibleIds = useMemo(
    () => filtered.filter((m) => m.status === "pending" || m.status === "sending").map((m) => m.messageId),
    [filtered],
  )

  // ─── Selection helpers (паттерн из list-view.tsx) ────────────────────────
  const selectedVisibleCount = useMemo(() => {
    let n = 0
    for (const id of visibleIds) if (selected.has(id)) n++
    return n
  }, [selected, visibleIds])
  const headerState: boolean | "indeterminate" =
    selectedVisibleCount === 0 ? false
    : selectedVisibleCount === visibleIds.length ? true
    : "indeterminate"

  const toggleAllVisible = () => {
    const next = new Set(selected)
    if (selectedVisibleCount === visibleIds.length) {
      for (const id of visibleIds) next.delete(id)
    } else {
      for (const id of visibleIds) next.add(id)
    }
    setSelected(next)
  }

  const toggleOne = (id: string, e?: React.MouseEvent) => {
    const next = new Set(selected)
    const isShift = !!(e && e.shiftKey)
    if (isShift && lastSelectedIdRef.current && lastSelectedIdRef.current !== id) {
      const fromIdx = visibleIds.indexOf(lastSelectedIdRef.current)
      const toIdx = visibleIds.indexOf(id)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
        const shouldSelect = !next.has(id)
        for (let i = lo; i <= hi; i++) {
          if (shouldSelect) next.add(visibleIds[i])
          else next.delete(visibleIds[i])
        }
        lastSelectedIdRef.current = id
        setSelected(next)
        return
      }
    }
    if (next.has(id)) next.delete(id)
    else next.add(id)
    lastSelectedIdRef.current = id
    setSelected(next)
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Inline rename ────────────────────────────────────────────────────────
  function startEdit(m: QueueItem) {
    setEditId(m.messageId)
    setEditVal(m.override ?? m.resolvedName)
  }

  async function saveName(candidateId: string) {
    setSavingId(candidateId)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", candidateId, firstName: editVal.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success("Имя обновлено — превью пересчитано")
      setEditId(null)
      await fetchItems()
    } catch {
      toast.error("Не удалось сохранить имя")
    } finally {
      setSavingId(null)
    }
  }

  // ─── Cancellation (optimistic) ───────────────────────────────────────────
  function dropMessages(ids: Set<string>) {
    setItems((prev) => prev.filter((m) => !ids.has(m.messageId)))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }

  async function cancelMessage(messageId: string) {
    setCancelingId(messageId)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", messageId }),
      })
      if (!res.ok) throw new Error()
      dropMessages(new Set([messageId]))
      toast.success("Сообщение удалено из очереди")
      onChanged?.()
    } catch {
      toast.error("Не удалось удалить сообщение")
    } finally {
      setCancelingId(null)
    }
  }

  async function cancelForCandidate(candidateId: string) {
    setBulkBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_for_candidate", candidateId }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const ids: string[] = (json.data ?? json).cancelled ?? []
      dropMessages(new Set(ids.length ? ids : items.filter((m) => m.candidateId === candidateId).map((m) => m.messageId)))
      toast.success(`Удалено ${ids.length || ""} сообщений кандидата`.trim())
      onChanged?.()
    } catch {
      toast.error("Не удалось удалить сообщения кандидата")
    } finally {
      setBulkBusy(false)
    }
  }

  async function cancelSelected() {
    const ids = [...selected].filter((id) => visibleIds.includes(id))
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_batch", messageIds: ids }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const cancelled: string[] = (json.data ?? json).cancelled ?? ids
      dropMessages(new Set(cancelled))
      toast.success(`Удалено ${cancelled.length} сообщений`)
      onChanged?.()
    } catch {
      toast.error("Не удалось удалить выбранные сообщения")
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени кандидата…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Все типы касаний</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b} value={b} className="text-xs">{branchLabel(b)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyCheck ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setOnlyCheck((v) => !v)}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Только проверить{needsCheck > 0 ? ` · ${needsCheck}` : ""}
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length === items.length ? `${items.length} сообщений` : `${filtered.length} из ${items.length}`}
        </span>
      </div>

      {/* Таблица */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-16">
          Журнал пуст — ни отложенных, ни недавно отправленных сообщений нет.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-16">
          Ничего не найдено по заданным фильтрам.
        </div>
      ) : (
        <TableCard>
          <DataTable>
            <DataHead>
              <DataSelectHeadCell
                checked={headerState === true}
                indeterminate={headerState === "indeterminate"}
                onCheckedChange={toggleAllVisible}
              />
              <DataHeadCell>Кандидат</DataHeadCell>
              <DataHeadCell>Обращение</DataHeadCell>
              <DataHeadCell>Превью</DataHeadCell>
              <DataHeadCell width="150px">Уйдёт в</DataHeadCell>
              <DataHeadCell width="130px">Статус</DataHeadCell>
              <DataHeadCell width="180px">Тип касания</DataHeadCell>
              <DataHeadCell align="center" width="72px">Касание</DataHeadCell>
              <DataHeadCell align="right" width="84px">Действия</DataHeadCell>
            </DataHead>
            <tbody>
              {filtered.map((m) => {
                const isExpanded = expanded.has(m.messageId)
                const isEditing = editId === m.messageId
                const isSelected = selected.has(m.messageId)
                const isPending = m.status === "pending" || m.status === "sending"
                const groupCount = pendingCountByCandidate.get(m.candidateId) ?? 0
                const note = SOURCE_NOTE[m.nameSource]
                return (
                  <DataRow
                    key={m.messageId}
                    className={cn("cursor-pointer align-top", isSelected && "bg-primary/5 hover:bg-primary/10")}
                    onClick={() => toggleExpand(m.messageId)}
                  >
                    {/* Чекбокс: клик по ячейке несёт shiftKey для диапазона
                        (как в list-view). stopPropagation, чтобы не раскрыть строку.
                        Для завершённых (не pending) выделение выключено. */}
                    <td
                      className="pl-5 pr-2 py-3 w-10 align-top"
                      onClick={(e) => { e.stopPropagation(); if (isPending) toggleOne(m.messageId, e) }}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={!isPending}
                        onCheckedChange={() => { /* handled by cell onClick */ }}
                        aria-label={isSelected ? "Снять выделение" : "Выделить сообщение"}
                      />
                    </td>
                    {/* Кандидат */}
                    <DataCell className="align-top">
                      <div className="flex items-start gap-1.5">
                        <button
                          type="button"
                          className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(m.messageId) }}
                          aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium truncate">{m.candidateName}</span>
                            {groupCount > 1 && (
                              <Badge variant="secondary" className="text-[10px] h-5 gap-0.5" title={`Всего сообщений в очереди: ${groupCount}`}>
                                <Users className="w-3 h-3" />{groupCount}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            hh: «{m.hhFirst ?? "—"}» · «{m.hhLast ?? "—"}»
                          </div>
                        </div>
                      </div>
                    </DataCell>
                    {/* Обращение (инлайн-переименование) */}
                    <DataCell className="align-top" onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            className="h-7 w-32 text-sm"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") saveName(m.candidateId); if (e.key === "Escape") setEditId(null) }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => saveName(m.candidateId)} disabled={savingId === m.candidateId}>
                            {savingId === m.candidateId
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Check className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <button
                            className="flex items-center gap-1 text-sm font-medium hover:text-primary group"
                            onClick={() => startEdit(m)}
                          >
                            {m.resolvedName}
                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60" />
                          </button>
                          <div className="flex items-center gap-1 flex-wrap">
                            {m.needsCheck && (
                              <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-300">
                                <AlertTriangle className="w-3 h-3 mr-0.5" />проверить
                              </Badge>
                            )}
                            {m.override && (
                              <Badge variant="outline" className="text-[10px] h-5 text-primary border-primary/40">
                                вручную
                              </Badge>
                            )}
                          </div>
                          {note && !m.override && (
                            <div className="text-[11px] text-amber-600 max-w-[200px]">⚠ {note}</div>
                          )}
                        </div>
                      )}
                    </DataCell>
                    {/* Превью / полный текст */}
                    <DataCell className="align-top">
                      <p className={cn(
                        "text-xs text-foreground/90 whitespace-pre-wrap",
                        isExpanded ? "" : "line-clamp-1",
                      )}>
                        {m.preview}
                      </p>
                      {!isExpanded && (
                        <span className="text-[11px] text-muted-foreground/70">нажмите, чтобы развернуть</span>
                      )}
                    </DataCell>
                    {/* Уйдёт в: для отправленных — время отправки, иначе плановое.
                        Крупно HH:MM (МСК), под ним дата и причина ожидания. */}
                    <DataCell className="align-top text-xs">
                      {(() => {
                        const isSent = m.status === "sent"
                        const when = isSent && m.sentAt ? m.sentAt : m.scheduledAt
                        return (
                          <div className="space-y-0.5">
                            <div className="font-medium tabular-nums whitespace-nowrap">
                              {isSent && <span className="text-muted-foreground font-normal">ушло в </span>}
                              {fmtHHMM(when)}
                            </div>
                            <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                              {fmtTime(when)}
                            </div>
                            {m.waitingReason && (
                              <div className="text-[11px] text-amber-600 dark:text-amber-400 max-w-[150px]">
                                {m.waitingReason}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </DataCell>
                    {/* Статус — русский бейдж с цветом */}
                    <DataCell className="align-top">
                      {(() => {
                        const sm = STATUS_META[m.status] ?? { label: m.status, cls: "text-muted-foreground border-muted-foreground/30" }
                        return (
                          <Badge variant="outline" className={cn("text-[11px] h-5", sm.cls)}>
                            {sm.label}
                          </Badge>
                        )
                      })()}
                    </DataCell>
                    {/* Тип касания */}
                    <DataCell className="align-top text-xs">
                      {branchLabel(m.branch)}
                    </DataCell>
                    {/* Касание */}
                    <DataCell align="center" className="align-top text-muted-foreground tabular-nums">
                      {m.touchNumber}
                    </DataCell>
                    {/* Действия — только для ещё не ушедших (pending/sending).
                        Отменить sent/cancelled/failed нельзя, кнопки скрыты. */}
                    <DataCell align="right" className="align-top" onClick={(e) => e.stopPropagation()}>
                      {isPending ? (
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
                            title="Удалить это сообщение"
                            onClick={() => cancelMessage(m.messageId)}
                            disabled={cancelingId === m.messageId || bulkBusy}
                          >
                            {cancelingId === m.messageId
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                          {groupCount > 1 && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 shrink-0 text-destructive/80 hover:bg-destructive/10"
                              title={`Удалить все ${groupCount} сообщений этого кандидата`}
                              onClick={() => cancelForCandidate(m.candidateId)}
                              disabled={bulkBusy}
                            >
                              <Users className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">—</span>
                      )}
                    </DataCell>
                  </DataRow>
                )
              })}
            </tbody>
          </DataTable>
        </TableCard>
      )}

      {/* Sticky-футер массовых действий */}
      {selectedVisibleCount > 0 && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border bg-card shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium">
            Выбрано {selectedVisibleCount}
            <button
              type="button"
              className="ml-2 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              сбросить
            </button>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs text-destructive border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            onClick={cancelSelected}
            disabled={bulkBusy}
          >
            {bulkBusy
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Удаляю…</>
              : <><Trash2 className="w-3.5 h-3.5 mr-1.5" />Удалить выбранные</>}
          </Button>
        </div>
      )}
    </div>
  )
}
