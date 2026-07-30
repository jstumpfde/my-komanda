"use client"

// Карточка «Напоминания об интервью в Telegram» — личная привязка текущего
// пользователя к платформенному боту @Ren_HR_bot
// (users.manager_reminder_chat_id, миграция 0270). Каденция — та же, что у
// кандидата: за сутки / утром / за час / за 15 минут.
//
// Общий компонент: используется в Профиле (/settings/profile) и в хабе
// настроек записи (шестерёнка /hr/calendar). До 11.07 код был скопирован
// дословно в двух местах — теперь один источник.

import { useState, useEffect } from "react"
import { Send, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export function ManagerReminderBotCard() {
  const [managerChatId, setManagerChatId] = useState<string | null>(null)
  const [reminderLinkCode, setReminderLinkCode] = useState<{ code: string; botUsername: string } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const u = d?.data ?? d
        setManagerChatId(u?.managerReminderChatId ?? null)
      })
      .catch(() => {})
  }, [])

  const handleGenerateCode = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/telegram/manager-bot/link-code", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? "Не удалось получить код"); return }
      const data = json.data ?? json
      setReminderLinkCode({ code: data.code, botUsername: data.botUsername })
    } catch { toast.error("Ошибка сети") }
    finally { setGenerating(false) }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerReminderChatId: null }),
      })
      if (!res.ok) { toast.error("Не удалось отключить"); return }
      setManagerChatId(null)
      setReminderLinkCode(null)
      toast.success("Бот напоминаний отключён")
    } catch { toast.error("Ошибка сети") }
    finally { setUnlinking(false) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Send className="size-4 text-muted-foreground" />
          Напоминания об интервью в Telegram
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Если вы назначаете интервью кандидатам, бот пришлёт напоминание за сутки,
          утром в день встречи, за час и за 15 минут до начала — так же, как получает кандидат.
        </p>
        {managerChatId ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">Подключено</Badge>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleUnlink} disabled={unlinking}>
              {unlinking ? <Loader2 className="size-3.5 animate-spin" /> : "Отключить"}
            </Button>
          </div>
        ) : reminderLinkCode ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-3 space-y-2">
            <p className="text-sm">
              Откройте{" "}
              <a href={`https://t.me/${reminderLinkCode.botUsername}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                @{reminderLinkCode.botUsername}
              </a>{" "}
              и отправьте боту команду:
            </p>
            <code className="block text-sm font-mono bg-background rounded px-2 py-1.5 border">/start {reminderLinkCode.code}</code>
            <p className="text-xs text-muted-foreground">Код действует 15 минут и одноразовый. Привязка личная — на аккаунт, под которым вы сейчас вошли.</p>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-2" onClick={handleGenerateCode} disabled={generating}>
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Подключить Telegram
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
