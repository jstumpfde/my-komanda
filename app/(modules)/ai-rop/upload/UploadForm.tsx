"use client"

// Форма ручной загрузки взаимодействия — звонок/чат/email/встреча, текст ИЛИ
// аудиофайл. POST → /api/modules/ai-rop/interactions/upload (multipart,
// зона API-агента; путь и поля — по образцу ca /api/interactions/upload).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Phone, MessageSquare, Mail, Video, FileText, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type Type = "call" | "chat" | "email" | "meeting"
type Channel = string
type Direction = "in" | "out" | ""

const TYPE_OPTIONS: Array<{ value: Type; label: string; icon: typeof Phone }> = [
  { value: "call", label: "Звонок", icon: Phone },
  { value: "chat", label: "Чат", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Встреча / запись", icon: Video },
]

const CHANNELS_BY_TYPE: Record<Type, Array<{ value: Channel; label: string }>> = {
  call: [{ value: "bitrix_telephony", label: "Bitrix24 АТС" }, { value: "manual", label: "Другое (ручная запись)" }],
  chat: [{ value: "whatsapp", label: "WhatsApp" }, { value: "telegram", label: "Telegram" }, { value: "openlines", label: "Bitrix Open Lines" }, { value: "manual", label: "Другое" }],
  email: [{ value: "email_imap", label: "Email" }, { value: "manual", label: "Другое" }],
  meeting: [{ value: "zoom", label: "Zoom" }, { value: "yandex_telemost", label: "Яндекс Телемост" }, { value: "dictaphone", label: "Диктофон / голосовая запись" }, { value: "other", label: "Другая платформа" }],
}

function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function UploadForm() {
  const router = useRouter()
  const [type, setType] = useState<Type>("call")
  const [channel, setChannel] = useState<Channel>(CHANNELS_BY_TYPE.call[0].value)
  const [direction, setDirection] = useState<Direction>("")
  const [clientPhone, setClientPhone] = useState("")
  const [clientName, setClientName] = useState("")
  const [managerId, setManagerId] = useState("")
  const [bitrixDealId, setBitrixDealId] = useState("")
  const [bitrixLeadId, setBitrixLeadId] = useState("")
  const [bitrixContactId, setBitrixContactId] = useState("")
  const [contentText, setContentText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [startedAt, setStartedAt] = useState(nowLocalInput)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  function onTypeChange(t: Type) {
    setType(t)
    const channels = CHANNELS_BY_TYPE[t]
    if (!channels.find((c) => c.value === channel)) setChannel(channels[0].value)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const fd = new FormData()
      fd.set("type", type)
      fd.set("channel", channel)
      if (direction) fd.set("direction", direction)
      if (clientPhone) fd.set("client_phone", clientPhone)
      if (clientName) fd.set("client_name", clientName)
      if (managerId) fd.set("manager_id", managerId)
      if (bitrixDealId) fd.set("bitrix_deal_id", bitrixDealId)
      if (bitrixLeadId) fd.set("bitrix_lead_id", bitrixLeadId)
      if (bitrixContactId) fd.set("bitrix_contact_id", bitrixContactId)
      if (startedAt) fd.set("started_at", startedAt.replace("T", " ") + ":00")
      if (contentText.trim()) fd.set("content_text", contentText)
      if (file) fd.set("file", file)

      const r = await fetch("/api/modules/ai-rop/interactions/upload", { method: "POST", body: fd })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error || "unknown")
      setMsg({ kind: "ok", text: `Загружено. Анализ запустится в течение минуты.` })
      setContentText(""); setFile(null); setClientPhone(""); setClientName("")
      if (data.callId) setTimeout(() => router.push(`/ai-rop/calls/${data.callId}`), 1200)
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message })
    } finally { setBusy(false) }
  }

  const channels = CHANNELS_BY_TYPE[type]

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4 rounded-xl border bg-card p-5">
      <div>
        <Label className="mb-2 block">Тип взаимодействия</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onTypeChange(opt.value)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  type === opt.value ? "border-violet-600 bg-violet-600/10 text-violet-700 dark:text-violet-400" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-3.5" /> {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Канал</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{channels.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Направление</Label>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant={direction === "in" ? "default" : "outline"} className="flex-1 gap-1" onClick={() => setDirection(direction === "in" ? "" : "in")}>
              <ArrowDownLeft className="size-3.5" /> Входящ.
            </Button>
            <Button type="button" size="sm" variant={direction === "out" ? "default" : "outline"} className="flex-1 gap-1" onClick={() => setDirection(direction === "out" ? "" : "out")}>
              <ArrowUpRight className="size-3.5" /> Исходящ.
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">Дата и время</Label><Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></div>
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">ID менеджера в Bitrix (опционально)</Label><Input value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="например 123" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">Телефон заказчика</Label><Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="79161234567" /></div>
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">Имя заказчика (опционально)</Label><Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Иван Петров" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">Bitrix Deal ID</Label><Input value={bitrixDealId} onChange={(e) => setBitrixDealId(e.target.value)} /></div>
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">Bitrix Lead ID</Label><Input value={bitrixLeadId} onChange={(e) => setBitrixLeadId(e.target.value)} /></div>
        <div><Label className="mb-1.5 block text-xs text-muted-foreground">Bitrix Contact ID</Label><Input value={bitrixContactId} onChange={(e) => setBitrixContactId(e.target.value)} /></div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          {type === "email" ? "Текст письма" : type === "chat" ? "Текст переписки" : "Транскрипт (если уже есть текстом)"}
        </Label>
        <Textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          rows={8}
          placeholder={type === "email" ? "Скопируйте содержимое письма" : type === "chat" ? "Менеджер: Здравствуйте...\nЗаказчик: Добрый день..." : "Менеджер: ...\nЗаказчик: ..."}
          className="font-mono text-xs"
        />
      </div>

      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">Файл записи (audio / video)</Label>
        <Input type="file" accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.ogg,.aac,.opus,.webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><FileText className="size-3" /> {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
      </div>

      {msg && (
        <div className={cn("rounded-lg border p-2.5 text-sm", msg.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-destructive/30 bg-destructive/10 text-destructive")}>
          {msg.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || (!contentText.trim() && !file)} className="min-w-[140px] gap-2">
          {busy && <Loader2 className="size-3.5 animate-spin" />} Загрузить
        </Button>
      </div>
    </form>
  )
}
