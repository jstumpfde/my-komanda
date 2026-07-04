"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Send, CheckCircle2, XCircle, RefreshCw, LogOut, AlertTriangle } from "lucide-react"

export interface AccountStatus {
  connected: boolean
  status: string | null
  phone?: string | null
  lastError?: string | null
  dailyLimit?: number
  lastConnectedAt?: string | null
  firstActivatedAt?: string | null
  sendingPaused?: boolean
  peerFloodUntil?: string | null
}

interface Props {
  status: AccountStatus | null
  loading: boolean
  onReload: () => Promise<void>
  onSyncChats: () => Promise<void>
  syncing: boolean
}

type Step = "idle" | "phone" | "code" | "password"

export function TelegramAccountSection({ status, loading, onReload, onSyncChats, syncing }: Props) {
  const [step, setStep] = useState<Step>("idle")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const connected = status?.connected ?? false
  const pendingCode = status?.status === "pending_code"
  const pendingPassword = status?.status === "pending_password"

  async function submitPhone() {
    if (!phone.trim()) { toast.error("Укажите номер телефона"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось отправить код"); return }
      toast.success("Код отправлен в Telegram")
      setStep("code")
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    } finally { setBusy(false) }
  }

  async function submitCode() {
    if (!code.trim()) { toast.error("Укажите код"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/connect/code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Неверный код"); return }
      if (data.need2fa) {
        toast.message("Нужен пароль двухфакторной аутентификации")
        setStep("password")
      } else {
        toast.success("Аккаунт подключён")
        setStep("idle")
        setPhone(""); setCode("")
      }
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    } finally { setBusy(false) }
  }

  async function submitPassword() {
    if (!password) { toast.error("Укажите пароль"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/connect/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Неверный пароль"); return }
      toast.success("Аккаунт подключён")
      setStep("idle")
      setPhone(""); setCode(""); setPassword("")
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    } finally { setBusy(false) }
  }

  async function togglePause(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/connect", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sending_paused: next }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось изменить паузу"); return }
      toast.success(next ? "Отправки приостановлены" : "Отправки возобновлены")
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    } finally { setBusy(false) }
  }

  async function disconnect() {
    if (!window.confirm("Отключить Telegram-аккаунт? Все запланированные посты перестанут отправляться.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/connect", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось отключить"); return }
      toast.success("Аккаунт отключён")
      setStep("idle")
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    } finally { setBusy(false) }
  }

  const showLoginForm = !connected && (step !== "idle" || !pendingCode && !pendingPassword)

  return (
    <div className="rounded-xl border border-border shadow-sm bg-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Send className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-semibold">Telegram-аккаунт</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Личный аккаунт владельца платформы для постинга отложенных сообщений в чаты и каналы.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка статуса…
        </div>
      ) : connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-medium">Подключено</span>
            {status?.phone && <span className="text-muted-foreground">· {status.phone}</span>}
          </div>

          {status?.firstActivatedAt && (Date.now() - new Date(status.firstActivatedAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Аккаунт подключён недавно — первую неделю суточный лимит отправок автоматически снижен (защита от блокировки Telegram), независимо от настроек.</span>
            </div>
          )}

          {status?.peerFloodUntil && new Date(status.peerFloodUntil).getTime() > Date.now() && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Telegram прислал сигнал PEER_FLOOD (слишком активная рассылка новым адресатам) — отправки
                автоматически приостановлены до {new Date(status.peerFloodUntil).toLocaleString("ru", { timeZone: "Europe/Moscow" })} МСК.
                Стоит снизить частоту и охват рассылки.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span>Аварийная пауза отправок</span>
            </div>
            <Switch checked={Boolean(status?.sendingPaused)} onCheckedChange={togglePause} disabled={busy} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={onSyncChats} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Обновить список чатов
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect} disabled={busy}
              className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50">
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Отключить
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {status?.lastError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-2.5">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{status.lastError}</span>
            </div>
          )}

          {(step === "idle" && !pendingCode && !pendingPassword) && showLoginForm && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Номер телефона</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00"
                  className="w-[220px]" disabled={busy} />
              </div>
              <Button size="sm" onClick={submitPhone} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Отправить код
              </Button>
            </div>
          )}

          {(step === "code" || (step === "idle" && pendingCode)) && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Код из Telegram</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345"
                  className="w-[160px]" disabled={busy} />
              </div>
              <Button size="sm" onClick={submitCode} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Подтвердить код
              </Button>
            </div>
          )}

          {(step === "password" || (step === "idle" && pendingPassword)) && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Пароль двухфакторной аутентификации</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-[220px]" disabled={busy} />
              </div>
              <Button size="sm" onClick={submitPassword} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Подтвердить пароль
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
