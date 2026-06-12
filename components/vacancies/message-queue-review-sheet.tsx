"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, Pencil, Check, X, Trash2, AlertTriangle } from "lucide-react"
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

interface Props {
  vacancyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void   // дёрнуть, когда что-то отменили (обновить счётчики секции)
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

export function MessageQueueReviewSheet({ vacancyId, open, onOpenChange, onChanged }: Props) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<Group[]>([])
  const [needsCheck, setNeedsCheck] = useState(0)
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/message-queue/items`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const items: QueueItem[] = (json.data ?? json).items ?? []
      setNeedsCheck((json.data ?? json).needsCheck ?? 0)
      // Группируем по кандидату, сохраняя порядок первого появления (по времени)
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

  useEffect(() => {
    if (open) fetchItems()
  }, [open, fetchItems])

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
      await fetchItems()   // перечитываем — превью пересоберётся с новым именем
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
      // Убираем из локального состояния
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="flex items-center gap-2">
            Очередь рассылки
            {!loading && <Badge variant="secondary" className="text-xs">{totalMsgs}</Badge>}
            {!loading && needsCheck > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                <AlertTriangle className="w-3 h-3 mr-1" />{needsCheck} проверить
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Отложенные сообщения. Проверьте имя (особенно с пометкой), поправьте при
            необходимости и удалите лишнее до отправки.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-20 px-5">
            Очередь пуста — отложенных сообщений нет.
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => {
              const note = SOURCE_NOTE[g.nameSource]
              const isEditing = editId === g.candidateId
              return (
                <div key={g.candidateId} className="px-5 py-4 space-y-3">
                  {/* Шапка кандидата: имя + что отдал hh + редактирование обращения */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{g.candidateName}</span>
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

                    {/* Обращение (что подставится в {{name}}) */}
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
      </SheetContent>
    </Sheet>
  )
}
