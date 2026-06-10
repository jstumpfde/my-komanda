"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ChevronDown, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Send,
} from "lucide-react"

interface BotStatus {
  connected:     boolean
  tokenMasked:   string | null
  username:      string | null
  webhookActive: boolean
}

export function CandidateTelegramBotCard() {
  const [status,      setStatus]      = useState<BotStatus | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [open,        setOpen]        = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [removing,    setRemoving]    = useState(false)
  const [token,       setToken]       = useState("")
  const [showToken,   setShowToken]   = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/company/candidate-telegram-bot")
      if (res.ok) setStatus(await res.json())
    } catch {
      // тихо
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleConnect = async () => {
    if (!token.trim()) { toast.error("Введите токен бота"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/company/candidate-telegram-bot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      })
      const data = await res.json() as { connected?: boolean; username?: string; name?: string; error?: string }
      if (!res.ok) { toast.error(data.error || "Ошибка подключения"); return }
      toast.success(`Бот @${data.username} подключён!`)
      setToken("")
      await loadStatus()
      setOpen(false)
    } catch {
      toast.error("Не удалось подключить бот")
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm("Отключить Telegram-бот? Кандидаты больше не смогут получать сообщения через него.")) return
    setRemoving(true)
    try {
      await fetch("/api/modules/hr/company/candidate-telegram-bot", { method: "DELETE" })
      toast.success("Бот отключён")
      await loadStatus()
    } catch {
      toast.error("Ошибка отключения")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 p-5 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
            <Send className="w-6 h-6 text-sky-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Telegram-бот для кандидатов</h3>
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : status?.connected ? (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />Подключено
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Не подключено</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Переписка с кандидатами через официальный Telegram Bot API
            </p>
            {status?.connected && status.username && (
              <p className="text-xs text-muted-foreground mt-1">
                @{status.username}
              </p>
            )}
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-4">
          {!status?.connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Создайте бота через{" "}
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                   className="text-primary underline underline-offset-2">@BotFather</a>,
                скопируйте токен и вставьте его ниже. После подключения кандидаты смогут
                начать диалог по ссылке-приглашению.
              </p>
              <div className="space-y-2">
                <Label htmlFor="cbot-token" className="text-sm font-medium">Токен бота</Label>
                <div className="relative">
                  <Input
                    id="cbot-token"
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="1234567890:ABCDefghIJKLmnOPQRstUVwxyz"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Токен хранится на сервере и никогда не передаётся в браузер.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleConnect}
                disabled={saving || !token.trim()}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Подключить бота
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Бот:</span>
                  <span className="font-medium">@{status.username}</span>
                </div>
                {status.tokenMasked && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Токен:</span>
                    <span className="font-mono text-xs text-muted-foreground">{status.tokenMasked}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Webhook:</span>
                  {status.webhookActive ? (
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />Активен
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-200">
                      Не установлен
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Кандидаты начинают диалог по ссылке-приглашению из карточки кандидата.
                Бот не пишет первым — только отвечает тем, кто перешёл по ссылке.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={handleDisconnect}
                disabled={removing}
              >
                {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Отключить бота
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
