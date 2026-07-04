"use client"

// Cookie-баннер (152-ФЗ + рекомендации Роскомнадзора по cookie-consent).
// Показывается один раз (решение помнится в localStorage), пишет факт
// согласия/отказа в БД через POST /api/consent (для журнала /admin/platform/
// consent-log). Категории: необходимые (всегда включены, неотключаемые),
// аналитика, маркетинг — каждую можно включить/выключить отдельно.
//
// Дизайн — shadcn/ui + Tailwind, свой (не копия MarketRadar).

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Cookie, Settings2 } from "lucide-react"
import { COOKIE_POLICY_VERSION } from "@/lib/legal/operator-requisites"

const STORAGE_KEY = "c24_cookie_consent"
const VISITOR_KEY = "c24_visitor_id"

interface StoredConsent {
  version: string
  analytics: boolean
  marketing: boolean
  decidedAt: string
}

function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return "unknown"
  }
}

function readStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConsent
    // Если версия документа изменилась — считаем согласие неактуальным,
    // баннер должен показаться снова.
    if (parsed.version !== COOKIE_POLICY_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

async function logConsent(action: "accepted" | "rejected" | "partial", details: Record<string, boolean>) {
  try {
    await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentType: "cookie",
        action,
        documentVersion: COOKIE_POLICY_VERSION,
        visitorId: getOrCreateVisitorId(),
        details,
      }),
    })
  } catch {
    // best-effort — баннер не должен ломаться, если лог не записался
  }
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [analytics, setAnalytics] = useState(true)
  const [marketing, setMarketing] = useState(true)

  useEffect(() => {
    if (!readStoredConsent()) setVisible(true)
  }, [])

  // Позволяет открыть баннер повторно (ссылка «Управление cookie» в подвале).
  useEffect(() => {
    const handler = () => {
      setShowSettings(true)
      setVisible(true)
    }
    window.addEventListener("c24:open-cookie-settings", handler)
    return () => window.removeEventListener("c24:open-cookie-settings", handler)
  }, [])

  function persist(next: Omit<StoredConsent, "version" | "decidedAt">) {
    const stored: StoredConsent = { version: COOKIE_POLICY_VERSION, decidedAt: new Date().toISOString(), ...next }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // ignore
    }
    // Уведомляет AnalyticsGate (и другие возможные потребители согласия в
    // будущем) о смене решения — без перезагрузки страницы.
    window.dispatchEvent(new Event("c24:consent-updated"))
    setVisible(false)
    setShowSettings(false)
  }

  function acceptAll() {
    persist({ analytics: true, marketing: true })
    void logConsent("accepted", { analytics: true, marketing: true })
  }

  function rejectOptional() {
    persist({ analytics: false, marketing: false })
    void logConsent("rejected", { analytics: false, marketing: false })
  }

  function saveSelection() {
    persist({ analytics, marketing })
    void logConsent("partial", { analytics, marketing })
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4 flex justify-center">
      <Card className="w-full max-w-2xl shadow-2xl border-border">
        <CardContent className="p-4 sm:p-5">
          {!showSettings ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Cookie className="hidden sm:block h-6 w-6 text-violet-600 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                Мы используем cookie для работы сайта и, с вашего согласия, для аналитики и
                маркетинга. Подробнее — в{" "}
                <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                  Политике конфиденциальности
                </a>
                .
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
                  <Settings2 className="h-4 w-4 mr-1" />
                  Настроить
                </Button>
                <Button variant="outline" size="sm" onClick={rejectOptional}>
                  Отклонить необязательные
                </Button>
                <Button size="sm" onClick={acceptAll}>
                  Принять все
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Cookie className="h-5 w-5 text-violet-600" />
                <h2 className="text-sm font-semibold">Настройки cookie</h2>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Необходимые</p>
                    <p className="text-xs text-muted-foreground">Авторизация, сессия, базовая работа сайта. Всегда включены.</p>
                  </div>
                  <Switch checked disabled />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Аналитика</p>
                    <p className="text-xs text-muted-foreground">Обезличенная статистика посещений для улучшения сайта.</p>
                  </div>
                  <Switch checked={analytics} onCheckedChange={setAnalytics} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Маркетинг</p>
                    <p className="text-xs text-muted-foreground">Персонализация предложений и рекламных сообщений.</p>
                  </div>
                  <Switch checked={marketing} onCheckedChange={setMarketing} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowSettings(false)}>
                  Назад
                </Button>
                <Button size="sm" onClick={saveSelection}>
                  Сохранить выбор
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Хелпер для ссылки «Управление cookie» в подвале/настройках — открывает
// баннер повторно с панелью настроек категорий.
export function openCookieSettings() {
  window.dispatchEvent(new Event("c24:open-cookie-settings"))
}
