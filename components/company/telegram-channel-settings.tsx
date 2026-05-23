"use client"

// Группа 34, задача 3: UI настройки per-company Telegram-канала HR.
// Сохраняет companies.telegramBotToken + telegramChatId через
// PUT /api/modules/hr/company/telegram. Кнопка «Отправить тест» дёргает
// POST /api/modules/hr/company/telegram/test.

import { useEffect, useState } from "react"
import { Loader2, Save, Send, MessageSquare } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function TelegramChannelSettings() {
  const [loaded, setLoaded] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [tokenMasked, setTokenMasked] = useState<string | null>(null)
  const [token, setToken] = useState("")
  const [chatId, setChatId] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/company/telegram")
      .then(r => r.ok ? r.json() : null)
      .then((d: { hasToken?: boolean; tokenMasked?: string | null; chatId?: string } | null) => {
        if (!d) return
        setHasToken(!!d.hasToken)
        setTokenMasked(d.tokenMasked ?? null)
        setChatId(d.chatId ?? "")
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const body: { botToken?: string; chatId?: string } = { chatId }
      // Если поле «новое значение токена» непустое — отправляем его. Иначе
      // оставляем текущий (на сервере есть защита: «маскированную» строку
      // он игнорирует).
      if (token.trim().length > 0) body.botToken = token.trim()
      const res = await fetch("/api/modules/hr/company/telegram", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || "save_failed")
      }
      toast.success("Сохранено")
      setToken("")
      // Обновим маску
      const re = await fetch("/api/modules/hr/company/telegram").then(r => r.ok ? r.json() : null) as { hasToken?: boolean; tokenMasked?: string | null } | null
      if (re) {
        setHasToken(!!re.hasToken)
        setTokenMasked(re.tokenMasked ?? null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetch("/api/modules/hr/company/telegram/test", { method: "POST" })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error || "test_failed")
      toast.success("Тестовое сообщение отправлено")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось отправить")
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Telegram-уведомления компании
        </CardTitle>
        <CardDescription>
          Получайте уведомления о новых кандидатах, AI-эскалациях и важных событиях в
          Telegram-канал вашей компании.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-[12px] leading-relaxed">
            1. Создайте бота через <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline">@BotFather</a> в Telegram и скопируйте токен.<br />
            2. Создайте канал/группу и добавьте туда бота с правами админа.<br />
            3. Узнайте Chat ID канала (например через @userinfobot) и вставьте сюда.
          </AlertDescription>
        </Alert>

        <div className="space-y-1.5">
          <Label className="text-xs">Bot Token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tokenMasked ?? "123456:ABC-DEF..."}
            disabled={!loaded}
            className="h-9 text-sm font-mono"
            autoComplete="off"
          />
          {hasToken && tokenMasked && !token && (
            <p className="text-[11px] text-muted-foreground">
              Сохранён токен <span className="font-mono">{tokenMasked}</span>. Введите новый, чтобы заменить.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Chat ID</Label>
          <Input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-1001234567890 или @your_channel"
            disabled={!loaded}
            className="h-9 text-sm font-mono"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={sendTest}
            disabled={testing || !hasToken || !chatId}
            className="gap-1.5 h-8 text-xs"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Отправить тест
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !loaded}
            className="gap-1.5 h-8 text-xs"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
