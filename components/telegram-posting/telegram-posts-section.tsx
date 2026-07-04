"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Plus, Loader2, Pencil, Trash2, Pause, Play, ChevronDown, ChevronUp, ImagePlus, X,
} from "lucide-react"
import type { ChatRow } from "./telegram-chats-section"

export interface PostRow {
  id: string
  title: string
  body: string
  imagePath: string | null
  chatIds: string[]
  scheduledAt: string
  repeatRule: string
  status: string
  lastError: string | null
}

interface DeliveryRow {
  id: string
  chatId: string
  chatTitle: string | null
  sentAt: string
  status: string
  error: string | null
  tgMessageId: string | null
}

const REPEAT_LABEL: Record<string, string> = { none: "Нет", daily: "Ежедневно", weekly: "Еженедельно" }
const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Запланирован", variant: "secondary" },
  sending:   { label: "Отправляется", variant: "default" },
  sent:      { label: "Отправлен", variant: "outline" },
  error:     { label: "Ошибка", variant: "destructive" },
  paused:    { label: "На паузе", variant: "outline" },
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  category: "vacancy" | "product"
  posts: PostRow[]
  chats: ChatRow[]
  loading: boolean
  onReload: () => Promise<void>
}

export function TelegramPostsSection({ category, posts, chats, loading, onReload }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<PostRow | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)

  // Form state
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set())
  const [scheduledAt, setScheduledAt] = useState("")
  const [repeatRule, setRepeatRule] = useState("none")
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditing(null)
    setTitle(""); setBody(""); setImagePath(null); setSelectedChats(new Set())
    const in1h = new Date(Date.now() + 60 * 60 * 1000)
    setScheduledAt(toDatetimeLocal(in1h.toISOString()))
    setRepeatRule("none")
    setSheetOpen(true)
  }

  function openEdit(p: PostRow) {
    setEditing(p)
    setTitle(p.title); setBody(p.body); setImagePath(p.imagePath)
    setSelectedChats(new Set(p.chatIds))
    setScheduledAt(toDatetimeLocal(p.scheduledAt))
    setRepeatRule(p.repeatRule)
    setSheetOpen(true)
  }

  async function onImageFile(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось загрузить картинку"); return }
      setImagePath(data.url)
    } catch {
      toast.error("Ошибка загрузки картинки")
    } finally { setUploading(false) }
  }

  async function save() {
    if (!title.trim()) { toast.error("Укажите название"); return }
    if (!body.trim()) { toast.error("Укажите текст поста"); return }
    if (selectedChats.size === 0) { toast.error("Выберите хотя бы один чат"); return }
    if (!scheduledAt) { toast.error("Укажите дату и время"); return }

    setSaving(true)
    try {
      const payload = {
        category,
        title: title.trim(),
        body,
        image_path: imagePath,
        chat_ids: [...selectedChats],
        scheduled_at: new Date(scheduledAt).toISOString(),
        repeat_rule: repeatRule,
      }
      const url = editing
        ? `/api/modules/telegram-posting/posts/${editing.id}`
        : `/api/modules/telegram-posting/posts`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось сохранить"); return }
      toast.success(editing ? "Пост обновлён" : "Пост запланирован")
      setSheetOpen(false)
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    } finally { setSaving(false) }
  }

  async function togglePause(p: PostRow) {
    const nextStatus = p.status === "paused" ? "scheduled" : "paused"
    try {
      const res = await fetch(`/api/modules/telegram-posting/posts/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось изменить статус"); return }
      toast.success(nextStatus === "paused" ? "Пост на паузе" : "Пост возобновлён")
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  async function remove(p: PostRow) {
    if (!window.confirm(`Удалить пост «${p.title}»?`)) return
    try {
      const res = await fetch(`/api/modules/telegram-posting/posts/${p.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось удалить"); return }
      toast.success("Пост удалён")
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  async function toggleExpand(p: PostRow) {
    if (expandedId === p.id) { setExpandedId(null); return }
    setExpandedId(p.id)
    setDeliveriesLoading(true)
    try {
      const res = await fetch(`/api/modules/telegram-posting/posts/${p.id}/deliveries`)
      const data = await res.json()
      setDeliveries(res.ok ? data.items ?? [] : [])
    } finally { setDeliveriesLoading(false) }
  }

  function chatTitle(id: string): string {
    return chats.find((c) => c.id === id)?.title ?? "?"
  }

  const chatOptions = chats.filter((c) => c.isEnabled)

  return (
    <div className="rounded-xl border border-border shadow-sm bg-card">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <h2 className="text-sm font-semibold">Отложенные посты</h2>
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Создать пост
        </Button>
      </div>

      <div className="divide-y divide-border/50">
        {loading && (
          <div className="px-4 py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        )}
        {!loading && posts.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Постов ещё нет.</div>
        )}
        {!loading && posts.map((p) => {
          const st = STATUS_LABEL[p.status] ?? { label: p.status, variant: "outline" as const }
          const isExpanded = expandedId === p.id
          return (
            <div key={p.id}>
              <div className="px-4 py-3 flex items-center gap-3 text-sm">
                <button onClick={() => toggleExpand(p)} className="text-muted-foreground hover:text-foreground shrink-0">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.chatIds.length} чат(ов) · {new Date(p.scheduledAt).toLocaleString("ru", { timeZone: "Europe/Moscow" })} МСК
                    {p.repeatRule !== "none" && <> · повтор: {REPEAT_LABEL[p.repeatRule]}</>}
                  </div>
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
                {p.lastError && <span className="text-xs text-red-500 max-w-[160px] truncate" title={p.lastError}>{p.lastError}</span>}
                <div className="flex items-center gap-1 shrink-0">
                  {(p.status === "scheduled" || p.status === "paused") && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => togglePause(p)}>
                        {p.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </Button>
                    </>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => remove(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-4 pb-3 pl-11">
                  {deliveriesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка лога…
                    </div>
                  ) : deliveries.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">Доставок ещё не было.</div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border/60 text-xs">
                      {deliveries.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="font-medium truncate max-w-[180px]">{d.chatTitle ?? chatTitle(d.chatId)}</span>
                          <span className="text-muted-foreground">{new Date(d.sentAt).toLocaleString("ru", { timeZone: "Europe/Moscow" })}</span>
                          <Badge variant={d.status === "sent" ? "outline" : "destructive"} className="ml-auto">
                            {d.status === "sent" ? "отправлено" : "ошибка"}
                          </Badge>
                          {d.error && <span className="text-red-500 truncate max-w-[200px]" title={d.error}>{d.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Редактировать пост" : "Новый пост"}</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Название (для списка)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Вакансия менеджера — понедельник" />
            </div>

            <div className="space-y-1.5">
              <Label>Текст поста</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Текст, который увидят в чате…" />
            </div>

            <div className="space-y-1.5">
              <Label>Картинка (опционально)</Label>
              {imagePath ? (
                <div className="flex items-center gap-2">
                  <img src={imagePath} alt="" className="h-16 w-16 object-cover rounded-lg border border-border" />
                  <Button size="sm" variant="outline" onClick={() => setImagePath(null)}>
                    <X className="h-3.5 w-3.5 mr-1.5" /> Убрать
                  </Button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Загрузить картинку
                  <input type="file" accept="image/*" hidden disabled={uploading}
                    onChange={(e) => onImageFile(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Чаты</Label>
              <div className="rounded-lg border border-border divide-y divide-border/60 max-h-[220px] overflow-y-auto">
                {chatOptions.map((c) => (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                    <Checkbox
                      checked={selectedChats.has(c.id)}
                      onCheckedChange={(v) => {
                        setSelectedChats((prev) => {
                          const next = new Set(prev)
                          if (v) next.add(c.id); else next.delete(c.id)
                          return next
                        })
                      }}
                    />
                    <span className="truncate flex-1">{c.title}</span>
                    {c.category && <Badge variant="outline" className="text-[10px]">{c.category === "job" ? "job" : "маркетинг"}</Badge>}
                  </label>
                ))}
                {chatOptions.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">Нет включённых чатов — синхронизируйте аккаунт.</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Дата и время (МСК)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Повтор</Label>
                <Select value={repeatRule} onValueChange={setRepeatRule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Нет</SelectItem>
                    <SelectItem value="daily">Ежедневно</SelectItem>
                    <SelectItem value="weekly">Еженедельно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editing ? "Сохранить" : "Запланировать"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
