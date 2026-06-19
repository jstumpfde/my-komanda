"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Settings, Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react"

interface SettingsState {
  configured: boolean; connected: boolean; status: string
  keyMasked: string; label: string; lastCheckAt: string | null; lastError: string | null
}

export default function EmailMarketingSettingsPage() {
  const [s, setS] = useState<SettingsState | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const d = await fetch("/api/modules/email-marketing/settings").then((r) => r.json())
    if (!d.error) { setS(d); setLabel(d.label || "") }
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!apiKey.trim()) { setMsg({ ok: false, text: "Введите ключ подключения" }); return }
    setSaving(true); setMsg(null)
    try {
      const d = await fetch("/api/modules/email-marketing/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), label: label.trim() }),
      }).then((r) => r.json())
      if (d.error) setMsg({ ok: false, text: d.error })
      else if (d.connected) { setMsg({ ok: true, text: "Подключение успешно проверено и сохранено." }); setApiKey("") }
      else setMsg({ ok: false, text: "Сохранено, но проверка не прошла: " + (d.error || "ключ не принят") })
      await load()
    } finally { setSaving(false) }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Settings className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Емайл маркетинг — Настройки</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Подключение к сервису рассылки. У каждой компании — своё.</p>
            </div>

            <div className="max-w-xl">
              {/* Status */}
              <div className="rounded-xl border border-border shadow-sm p-5 bg-card mb-4">
                <div className="flex items-center gap-2 mb-1">
                  {s?.connected ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
                  <span className="font-medium">{s?.connected ? "Подключено" : "Не подключено"}</span>
                </div>
                {!s?.configured && <p className="text-xs text-amber-600 mt-1">Сервис рассылки не настроен на платформе — обратитесь к администратору.</p>}
                {s?.keyMasked && <p className="text-xs text-muted-foreground mt-2">Текущий ключ: <span className="font-mono">{s.keyMasked}</span></p>}
                {s?.lastError && !s.connected && <p className="text-xs text-red-500 mt-1">Последняя ошибка: {s.lastError}</p>}
                {s?.lastCheckAt && <p className="text-xs text-muted-foreground mt-1">Проверено: {new Date(s.lastCheckAt).toLocaleString("ru")}</p>}
              </div>

              {/* Form */}
              <div className="rounded-xl border border-border shadow-sm p-5 bg-card">
                <label className="block text-sm font-medium mb-1.5">Ключ подключения (API-ключ)</label>
                <div className="relative mb-4">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="Вставьте ключ из кабинета сервиса"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
                <label className="block text-sm font-medium mb-1.5">Название (необязательно)</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Напр. «Основной аккаунт»"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40 mb-4" />
                <button onClick={save} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Сохранить и проверить
                </button>
                {msg && <div className={`mt-3 text-xs rounded-lg p-3 ${msg.ok ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"}`}>{msg.text}</div>}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
