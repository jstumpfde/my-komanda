"use client"

// Клиентская часть экрана «Каналы»: список + диалог добавления (почта/
// Telegram/WhatsApp) + проверка соединения/вкл-выкл/удаление.
// API: /api/modules/ai-rop/connectors (GET/POST), /[id] (PATCH/DELETE),
// /[id]/validate (POST).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Mail, MessageCircle, Plus, RefreshCw, Send, Trash2, Copy, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export interface ConnectorRow {
  id: string
  kind: string
  providerKey: string | null
  title: string
  mode: string
  country: string
  isEnabled: boolean
  status: string
  lastSyncAt: string | null
  lastError: string | null
  webhookUrl: string | null
}

const KIND_LABELS: Record<string, string> = {
  imap: "Почта (IMAP)",
  telegram_bot: "Telegram-бот",
  whatsapp_agg: "WhatsApp (Wazzup)",
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидает проверки", variant: "secondary" },
  active: { label: "Активен", variant: "default" },
  error: { label: "Ошибка", variant: "destructive" },
  disabled: { label: "Отключён", variant: "outline" },
}

function formatDate(iso: string | null): string {
  if (!iso) return "ещё не было"
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

export function ConnectorsClient({ initialConnectors }: { initialConnectors: ConnectorRow[] }) {
  const router = useRouter()
  const [connectors, setConnectors] = useState(initialConnectors)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  function refresh() {
    router.refresh()
  }

  async function toggleEnabled(row: ConnectorRow) {
    setBusyId(row.id)
    try {
      await fetch(`/api/modules/ai-rop/connectors/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !row.isEnabled }),
      })
      setConnectors((prev) => prev.map((c) => (c.id === row.id ? { ...c, isEnabled: !c.isEnabled } : c)))
    } finally {
      setBusyId(null)
    }
  }

  async function validateConnector(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/modules/ai-rop/connectors/${id}/validate`, { method: "POST" })
      const data = await res.json()
      setConnectors((prev) => prev.map((c) => (c.id === id ? { ...c, status: data.ok ? "active" : "error", lastError: data.ok ? null : data.error } : c)))
    } finally {
      setBusyId(null)
    }
  }

  async function deleteConnector(id: string) {
    if (!confirm("Удалить канал? Все связанные сообщения тоже удалятся.")) return
    setBusyId(id)
    try {
      await fetch(`/api/modules/ai-rop/connectors/${id}`, { method: "DELETE" })
      setConnectors((prev) => prev.filter((c) => c.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" /> Добавить канал
            </Button>
          </DialogTrigger>
          <AddConnectorDialog
            onCreated={(row) => {
              setConnectors((prev) => [row, ...prev])
              setDialogOpen(false)
              refresh()
            }}
          />
        </Dialog>
      </div>

      {connectors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Пока ни один канал не подключён — почта, Telegram и WhatsApp дают SalesRadar доступ к переписке в обход CRM.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {connectors.map((row) => {
            const statusInfo = STATUS_LABELS[row.status] ?? { label: row.status, variant: "outline" as const }
            const busy = busyId === row.id
            return (
              <Card key={row.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      {row.kind === "imap" && <Mail className="size-4 text-violet-600" />}
                      {row.kind === "telegram_bot" && <Send className="size-4 text-sky-600" />}
                      {row.kind === "whatsapp_agg" && <MessageCircle className="size-4 text-emerald-600" />}
                      {row.title}
                    </CardTitle>
                    <Switch checked={row.isEnabled} disabled={busy} onCheckedChange={() => toggleEnabled(row)} />
                  </div>
                  <CardDescription className="flex items-center gap-1.5 text-xs">
                    {KIND_LABELS[row.kind] ?? row.kind} · {row.mode === "pull" ? "опрос" : "вебхук"}
                    <Badge variant={statusInfo.variant} className="ml-1">{statusInfo.label}</Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <div>Последняя синхронизация: {formatDate(row.lastSyncAt)}</div>
                  {row.lastError && <div className="text-destructive">Ошибка: {row.lastError}</div>}
                  {row.webhookUrl && <WebhookUrlField url={row.webhookUrl} />}
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => validateConnector(row.id)}>
                      {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Проверить
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive" disabled={busy} onClick={() => deleteConnector(row.id)}>
                      <Trash2 className="size-3" /> Удалить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WebhookUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <Input readOnly value={url} className="h-7 flex-1 text-[11px]" onFocus={(e) => e.currentTarget.select()} />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  )
}

function AddConnectorDialog({ onCreated }: { onCreated: (row: ConnectorRow) => void }) {
  const [kind, setKind] = useState<"imap" | "telegram_bot" | "whatsapp_agg">("imap")
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // imap
  const [host, setHost] = useState("")
  const [port, setPort] = useState("993")
  const [folder, setFolder] = useState("INBOX")
  const [ourDomains, setOurDomains] = useState("")
  const [imapUser, setImapUser] = useState("")
  const [imapPass, setImapPass] = useState("")

  // telegram
  const [botToken, setBotToken] = useState("")

  // whatsapp
  const [wazzupApiKey, setWazzupApiKey] = useState("")

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      let body: Record<string, unknown>
      if (kind === "imap") {
        body = {
          kind,
          title: title || host,
          config: { host, port: Number(port) || 993, secure: true, folder, ourDomains: ourDomains.split(",").map((s) => s.trim()).filter(Boolean) },
          creds: { user: imapUser, pass: imapPass },
        }
      } else if (kind === "telegram_bot") {
        body = { kind, title: title || "Telegram-бот", config: {}, creds: { botToken } }
      } else {
        body = { kind, title: title || "WhatsApp (Wazzup)", providerKey: "wazzup", config: { providerKey: "wazzup" }, creds: { apiKey: wazzupApiKey } }
      }

      const res = await fetch("/api/modules/ai-rop/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Не удалось подключить канал")
        return
      }
      onCreated({
        id: data.id,
        kind,
        providerKey: kind === "whatsapp_agg" ? "wazzup" : null,
        title: title || data.accountLabel || kind,
        mode: kind === "imap" ? "pull" : "webhook",
        country: "RU",
        isEnabled: true,
        status: "active",
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        webhookUrl: data.webhookUrl ?? null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Добавить канал</DialogTitle>
      </DialogHeader>

      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="imap">Почта</TabsTrigger>
          <TabsTrigger value="telegram_bot">Telegram</TabsTrigger>
          <TabsTrigger value="whatsapp_agg">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="imap" className="flex flex-col gap-3 pt-3">
          <Field label="Название (необязательно)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="sales@company.ru" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IMAP-хост"><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.yandex.ru" /></Field>
            <Field label="Порт"><Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="993" /></Field>
          </div>
          <Field label="Почта (логин)"><Input value={imapUser} onChange={(e) => setImapUser(e.target.value)} placeholder="sales@company.ru" /></Field>
          <Field label="Пароль приложения"><Input type="password" value={imapPass} onChange={(e) => setImapPass(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Папка"><Input value={folder} onChange={(e) => setFolder(e.target.value)} /></Field>
            <Field label="Свои домены (через запятую)"><Input value={ourDomains} onChange={(e) => setOurDomains(e.target.value)} placeholder="company.ru" /></Field>
          </div>
          <p className="text-xs text-muted-foreground">Опрашивается по расписанию — курсор по UID, без вложений в этой версии.</p>
        </TabsContent>

        <TabsContent value="telegram_bot" className="flex flex-col gap-3 pt-3">
          <Field label="Название (необязательно)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Бот отдела продаж" /></Field>
          <Field label="Токен бота (от @BotFather)"><Input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:AA..." /></Field>
          <p className="text-xs text-muted-foreground">Добавьте бота в рабочие группы/чаты — вебхук зарегистрируется автоматически при подключении.</p>
        </TabsContent>

        <TabsContent value="whatsapp_agg" className="flex flex-col gap-3 pt-3">
          <Field label="Название (необязательно)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="WhatsApp продажи" /></Field>
          <Field label="API-ключ Wazzup24"><Input value={wazzupApiKey} onChange={(e) => setWazzupApiKey(e.target.value)} /></Field>
          <p className="text-xs text-muted-foreground">После подключения скопируйте вебхук-URL из карточки канала и вставьте его в настройки Wazzup.</p>
        </TabsContent>
      </Tabs>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button onClick={submit} disabled={busy} className="gap-1.5">
          {busy && <Loader2 className="size-4 animate-spin" />} Подключить
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
