"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Pencil, Check, X, Trash2, AlertTriangle, Search } from "lucide-react"
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
  branch: string
  touchNumber: number
  preview: string
}

interface Group {
  candidateId: string
  candidateName: string
  hhFirst: string | null
  hhLast: string | null
  override: string | null
  resolvedName: string
  nameSource: string
  needsCheck: boolean
  messages: QueueItem[]
}

const BRANCH_LABELS: Record<string, string> = {
  not_opened: "Не открыл демо", opened_not_finished: "Открыл, не дошёл",
  anketa_confirmation: "Подтверждение анкеты", anketa_auto_reply: "Автоответ анкеты",
  first_msg_2: "Сообщение 2", first_msg_3: "Сообщение 3", first_msg_offhours: "Внерабочий отклик",
  test_after_message: "После теста", test_invite: "Приглашение на тест",
  test_reminder: "Напоминание о тесте", test_not_opened: "Тест не открыт",
  test_opened_not_submitted: "Тест не отправлен", schedule_invite: "Приглашение на интервью",
}

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

interface Props {
  vacancyId: string
  onChanged?: () => void   // дёрнуть при отмене сообщения (обновить счётчики секции)
}

/** Инлайн-журнал очереди рассылки: список сообщений, сгруппированных по
 *  кандидату, с фильтрами (поиск по имени, тип касания, «только проверить»),
 *  правкой обращения и отменой отдельных сообщений. Не в Sheet — прямо на вкладке. */
export function MessageQueueJournal({ vacancyId, onChanged }: Props) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<Group[]>([])
  const [needsCheck, setNeedsCheck] = useState(0)
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  // Фильтры
  const [search, setSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [onlyCheck, setOnlyCheck] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const items: QueueItem[] = (json.data ?? json).items ?? []
      setNeedsCheck((json.data ?? json).needsCheck ?? 0)
      const map = new Map<string, Group>()
      for (const it of items) {
        let g = map.get(it.candidateId)
        if (!g) {
          g = {
            candidateId: it.candidateId, candidateName: it.candidateName,
            hhFirst: it.hhFirst, hhLast: it.hhLast, override: it.override,
            resolvedName: it.resolvedName, nameSource: it.nameSource,
            needsCheck: it.needsCheck, messages: [],
          }
          map.set(it.candidateId, g)
        }
        g.messages.push(it)
      }
      setGroups([...map.values()])
    } catch {
      toast.error("Не удалось загрузить очередь")
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Список веток, реально присутствующих в очереди — для дропдауна
  const branches = useMemo(() => {
    const set = new Set<string>()
    groups.forEach(g => g.messages.forEach(m => set.add(m.branch)))
    return [...set]
  }, [groups])

  // Применяем фильтры: поиск по имени (группа), тип касания (сообщения), «проверить» (группа)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups
      .filter(g => !onlyCheck || g.needsCheck)
      .filter(g => !q || g.candidateName.toLowerCase().includes(q) || (g.resolvedName ?? "").toLowerCase().includes(q))
      .map(g => branchFilter === "all" ? g : { ...g, messages: g.messages.filter(m => m.branch === branchFilter) })
      .filter(g => g.messages.length > 0)
  }, [groups, search, branchFilter, onlyCheck])

  function startEdit(g: Group) {
    setEditId(g.candidateId)
    setEditVal(g.override ?? g.resolvedName)
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

  async function cancelMessage(messageId: string) {
    setCancelingId(messageId)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", messageId }),
      })
      if (!res.ok) throw new Error()
      setGroups((prev) =>
        prev
          .map((g) => ({ ...g, messages: g.messages.filter((m) => m.messageId !== messageId) }))
          .filter((g) => g.messages.length > 0),
      )
      toast.success("Сообщение удалено из очереди")
      onChanged?.()
    } catch {
      toast.error("Не удалось удалить сообщение")
    } finally {
      setCancelingId(null)
    }
  }

  const totalMsgs = groups.reduce((n, g) => n + g.messages.length, 0)
  const shownMsgs = filtered.reduce((n, g) => n + g.messages.length, 0)

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
            {branches.map(b => (
              <SelectItem key={b} value={b} className="text-xs">{BRANCH_LABELS[b] ?? b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyCheck ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setOnlyCheck(v => !v)}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Только проверить{needsCheck > 0 ? ` · ${needsCheck}` : ""}
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {shownMsgs === totalMsgs ? `${totalMsgs} сообщений` : `${shownMsgs} из ${totalMsgs}`}
        </span>
      </div>

      {/* Журнал */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-16">
          Очередь пуста — отложенных сообщений нет.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-16">
          Ничего не найдено по заданным фильтрам.
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filtered.map((g) => {
            const note = SOURCE_NOTE[g.nameSource]
            const isEditing = editId === g.candidateId
            return (
              <div key={g.candidateId} className="px-4 py-3.5 space-y-3">
                {/* Шапка кандидата */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{g.candidateName}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{g.messages.length}</Badge>
                    {g.needsCheck && (
                      <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-300">
                        <AlertTriangle className="w-3 h-3 mr-0.5" />проверить
                      </Badge>
                    )}
                    {g.override && (
                      <Badge variant="outline" className="text-[10px] h-5 text-primary border-primary/40">
                        имя задано вручную
                      </Badge>
                    )}
                  </div>

                  <div className="text-[11px] text-muted-foreground">
                    hh: имя «{g.hhFirst ?? "—"}» · фамилия «{g.hhLast ?? "—"}»
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Обращение:</span>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          className="h-7 w-40 text-sm"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") saveName(g.candidateId) }}
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => saveName(g.candidateId)} disabled={savingId === g.candidateId}>
                          {savingId === g.candidateId
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1 text-sm font-medium hover:text-primary group"
                        onClick={() => startEdit(g)}
                      >
                        {g.resolvedName}
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60" />
                      </button>
                    )}
                  </div>

                  {note && !g.override && (
                    <div className="text-[11px] text-amber-600">⚠ {note}</div>
                  )}
                </div>

                {/* Сообщения кандидата */}
                <div className="space-y-2">
                  {g.messages.map((m) => (
                    <div key={m.messageId} className="rounded-md border bg-muted/30 p-2.5 flex gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{fmtTime(m.scheduledAt)}</span>
                          <span>·</span>
                          <span>{BRANCH_LABELS[m.branch] ?? m.branch}</span>
                        </div>
                        <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3">
                          {m.preview}
                        </p>
                      </div>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
                        title="Удалить из очереди"
                        onClick={() => cancelMessage(m.messageId)}
                        disabled={cancelingId === m.messageId}
                      >
                        {cancelingId === m.messageId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
