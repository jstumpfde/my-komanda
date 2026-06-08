"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ChevronDown, Loader2, CheckCircle2, XCircle, Clock,
  Eye, EyeOff, Settings2,
} from "lucide-react"

interface AvitoStatus {
  configured:     boolean
  isEnabled?:     boolean
  isActive?:      boolean
  userId?:        string | null
  clientId?:      string | null
  hasSecret?:     boolean
  hasToken?:      boolean
  tokenExpiresAt?: string | null
  lastSyncedAt?:  string | null
  createdAt?:     string | null
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric", month: "short", year: "numeric",
  })
}

export function AvitoIntegrationCard() {
  const [status, setStatus]             = useState<AvitoStatus | null>(null)
  const [loading, setLoading]           = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [toggling, setToggling]         = useState(false)

  // Форма настроек
  const [clientId,     setClientId]     = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [userId,       setUserId]       = useState("")
  const [showSecret,   setShowSecret]   = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/avito")
      const data = await res.json() as AvitoStatus
      setStatus(data)
      if (data.configured) {
        setClientId(data.clientId ?? "")
        setUserId(data.userId ?? "")
        // secret не приходит с сервера — оставляем поле пустым (placeholder «••••••»)
      }
    } catch {
      setStatus({ configured: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Сохранение настроек (ключи)
  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        clientId: clientId.trim(),
        userId:   userId.trim(),
      }
      // Передаём secret только если пользователь что-то ввёл
      if (clientSecret.trim()) {
        body.clientSecret = clientSecret.trim()
      }
      const res = await fetch("/api/integrations/avito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("HTTP " + res.status)
      toast.success("Настройки Авито сохранены")
      setClientSecret("") // сбрасываем поле секрета
      await loadStatus()
      setSettingsOpen(false)
    } catch {
      toast.error("Ошибка сохранения настроек Авито")
    } finally {
      setSaving(false)
    }
  }

  // Включение/выключение интеграции (тумблер)
  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      if (!enabled) {
        // Выключаем через DELETE
        await fetch("/api/integrations/avito", { method: "DELETE" })
        toast.success("Авито-интеграция выключена")
      } else {
        // Включаем через POST isEnabled=true
        await fetch("/api/integrations/avito", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isEnabled: true }),
        })
        toast.success("Авито-интеграция включена")
      }
      await loadStatus()
    } catch {
      toast.error("Ошибка изменения статуса интеграции")
    } finally {
      setToggling(false)
    }
  }

  const isConnected = status?.configured && status?.isEnabled && status?.isActive

  return (
    <Card className="rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Логотип + название + статус */}
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <span className="text-blue-600 font-bold text-base">А</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Авито Работа</h3>
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : isConnected ? (
                <Badge
                  variant="outline"
                  className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />Активно
                </Badge>
              ) : status?.configured ? (
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-500/10 text-amber-700 border-amber-200"
                >
                  Настроено, выключено
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Не настроено
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Чаты с кандидатами через Авито Мессенджер
            </p>
            {status?.configured && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                {status.userId && (
                  <span className="flex items-center gap-1 font-mono">
                    ID: {status.userId}
                  </span>
                )}
                {status.createdAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />Подключено {formatDate(status.createdAt)}
                  </span>
                )}
                {status.hasToken && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" />Токен активен
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Кнопки управления */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status?.configured && (
            <div className="flex items-center gap-2">
              {toggling ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={status.isEnabled ?? false}
                  onCheckedChange={handleToggle}
                  disabled={toggling}
                  aria-label="Включить интеграцию Авито"
                />
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setSettingsOpen(o => !o)}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {status?.configured ? "Настройки" : "Подключить"}
            <ChevronDown
              className={cn(
                "w-3 h-3 text-muted-foreground transition-transform",
                settingsOpen && "rotate-180",
              )}
            />
          </Button>
          {status?.configured && status?.isEnabled && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => handleToggle(false)}
              disabled={toggling}
            >
              <XCircle className="w-3.5 h-3.5" />
              Отключить
            </Button>
          )}
        </div>
      </div>

      {/* Панель настроек */}
      {settingsOpen && (
        <div className="mt-5 border-t border-border pt-5 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">
              Ключи API Авито (client_credentials)
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              Получите ключи в{" "}
              <a
                href="https://www.avito.ru/professionals/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                кабинете разработчика Авито
              </a>
              . Тип авторизации: client_credentials. Для работы чатов нужен скоуп{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">messenger:read,write</code>.
            </p>

            <div className="space-y-3">
              {/* Client ID */}
              <div className="space-y-1.5">
                <Label htmlFor="avito-client-id" className="text-xs font-medium">
                  Client ID
                </Label>
                <Input
                  id="avito-client-id"
                  placeholder="Числовой или строковый Client ID"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
              </div>

              {/* Client Secret */}
              <div className="space-y-1.5">
                <Label htmlFor="avito-client-secret" className="text-xs font-medium">
                  Client Secret
                  {status?.hasSecret && (
                    <span className="ml-2 text-muted-foreground font-normal">
                      (сохранён — оставьте пустым, чтобы не менять)
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="avito-client-secret"
                    type={showSecret ? "text" : "password"}
                    placeholder={status?.hasSecret ? "••••••••" : "Client Secret"}
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                    className="h-8 text-sm font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showSecret ? "Скрыть секрет" : "Показать секрет"}
                  >
                    {showSecret
                      ? <EyeOff className="w-3.5 h-3.5" />
                      : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* User ID */}
              <div className="space-y-1.5">
                <Label htmlFor="avito-user-id" className="text-xs font-medium">
                  User ID <span className="font-normal text-muted-foreground">(числовой ID пользователя Авито)</span>
                </Label>
                <Input
                  id="avito-user-id"
                  placeholder="Числовой ID вашего аккаунта Авито"
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Найти: профиль Авито → адрес страницы или GET /core/v1/accounts/self
                </p>
              </div>
            </div>
          </div>

          {/* Кнопки формы */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Сохранить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                setSettingsOpen(false)
                setClientSecret("")
              }}
            >
              Отмена
            </Button>
          </div>

          {/* Предупреждение о черновике */}
          <p className="text-[11px] text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2">
            Интеграция в стадии разработки. Убедитесь, что на вашем тарифе Авито доступен
            Messenger API (скоуп messenger:read,write). Политика канала автоматически
            удаляет ссылки и телефоны из исходящих сообщений согласно правилам Авито.
          </p>
        </div>
      )}
    </Card>
  )
}
